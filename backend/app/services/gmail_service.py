import base64
import logging
import re
from datetime import datetime, timezone

from google.auth.exceptions import RefreshError
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from sqlalchemy.orm import Session

from app.models.user import User
from app.services.google_calendar import GMAIL_SCOPES, get_google_credentials

_FOLDER_LABELS = {"inbox": "INBOX", "sent": "SENT"}

_METADATA_HEADERS = ["From", "To", "Subject", "Date"]

# Gmail caps a batch at 100 sub-requests and recommends staying well under it.
_BATCH_SIZE = 50

_NOT_CONNECTED_DETAIL = "Gmail 권한이 없습니다. 설정에서 이메일을 다시 연결하세요."

logger = logging.getLogger(__name__)


class GmailError(Exception):
    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


def _service(user: User, db: Session):
    try:
        creds = get_google_credentials(user, db, GMAIL_SCOPES, purpose="gmail")
    except RefreshError:
        # The stored refresh_token doesn't cover gmail.readonly yet (user
        # hasn't reconnected since it was added) — Google rejects the refresh
        # outright with invalid_scope rather than an ordinary HttpError.
        raise GmailError(400, _NOT_CONNECTED_DETAIL) from None
    return build("gmail", "v1", credentials=creds)


def _wrap_http_error(exc: HttpError) -> GmailError:
    status = getattr(exc.resp, "status", None) or 502
    code = 400 if 400 <= status < 500 else 502
    return GmailError(code, f"Gmail 오류: {exc.reason}")


def _headers_dict(payload: dict) -> dict[str, str]:
    return {h["name"]: h["value"] for h in payload.get("headers", [])}


def _decode_part_data(data: str) -> str:
    padded = data + "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(padded).decode("utf-8", errors="replace")


def _strip_html(html: str) -> str:
    text = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", html, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def _extract_body(payload: dict) -> str:
    """Walk MIME parts depth-first, preferring text/plain over text/html."""
    plain: str | None = None
    html: str | None = None

    def walk(part: dict):
        nonlocal plain, html
        mime = part.get("mimeType", "")
        body = part.get("body", {})
        data = body.get("data")
        if data:
            if mime == "text/plain" and plain is None:
                plain = _decode_part_data(data)
            elif mime == "text/html" and html is None:
                html = _decode_part_data(data)
        for sub in part.get("parts", []) or []:
            walk(sub)

    walk(payload)
    if plain is not None:
        return plain
    if html is not None:
        return _strip_html(html)
    return ""


def _summary(message: dict) -> dict:
    headers = _headers_dict(message.get("payload", {}))
    internal_date = message.get("internalDate")
    date_iso = (
        datetime.fromtimestamp(int(internal_date) / 1000, tz=timezone.utc).isoformat()
        if internal_date
        else headers.get("Date", "")
    )
    return {
        "id": message["id"],
        "thread_id": message.get("threadId", message["id"]),
        "subject": headers.get("Subject") or "(제목 없음)",
        "from_": headers.get("From", ""),
        "snippet": message.get("snippet", ""),
        "date": date_iso,
        "unread": "UNREAD" in message.get("labelIds", []),
    }


def get_connected_address(user: User, db: Session) -> str | None:
    """Gmail address of the account currently connected for email, or None.

    Purely informational (shown on the 이메일 page so the user can tell which
    account they are reading), so any failure degrades to None instead of
    breaking the page.
    """
    if not user.gmail_connected:
        return None
    try:
        profile = _service(user, db).users().getProfile(userId="me").execute()
    except Exception:
        logger.warning("Failed to read Gmail profile for user_id=%s", user.id, exc_info=True)
        return None
    address = profile.get("emailAddress")
    return address if isinstance(address, str) else None


def _fetch_batch(service, message_ids: list[str], into: dict[str, dict]) -> None:
    """Run one batched ``messages.get`` for ``message_ids``, filling ``into``.

    A message that fails on its own is dropped rather than blanking the whole
    page; if every message in the batch fails it is not a per-message problem,
    so that error is raised.
    """
    failures: list[Exception] = []

    def collect(request_id, response, exception):
        if exception is not None:
            logger.warning("Gmail batch item %s failed: %s", request_id, exception)
            failures.append(exception)
            return
        into[request_id] = _summary(response)

    batch = service.new_batch_http_request(callback=collect)
    for message_id in message_ids:
        batch.add(
            service.users()
            .messages()
            .get(userId="me", id=message_id, format="metadata", metadataHeaders=_METADATA_HEADERS),
            request_id=message_id,
        )
    batch.execute()

    if failures and len(failures) == len(message_ids):
        first = failures[0]
        if isinstance(first, HttpError):
            raise first
        raise GmailError(502, f"Gmail 오류: {first}")


def _summaries_for_ids(service, message_ids: list[str]) -> list[dict]:
    """Metadata for every id, fetched with batched requests.

    Gmail's list endpoint returns bare ids, so each message still needs its own
    ``messages.get``. Issuing those one at a time cost one round trip per
    message (~21 for a 20-message page, all sequential); the batch endpoint
    packs up to ``_BATCH_SIZE`` of them into a single HTTP request.

    Results keep the order of ``message_ids``; ids that failed are skipped.
    """
    by_id: dict[str, dict] = {}
    for start in range(0, len(message_ids), _BATCH_SIZE):
        _fetch_batch(service, message_ids[start : start + _BATCH_SIZE], by_id)
    return [by_id[message_id] for message_id in message_ids if message_id in by_id]


def list_messages(
    user: User, db: Session, folder: str, page_token: str | None = None, max_results: int = 20
) -> dict:
    label = _FOLDER_LABELS.get(folder, "INBOX")
    try:
        service = _service(user, db)
        listing = (
            service.users()
            .messages()
            .list(userId="me", labelIds=[label], maxResults=max_results, pageToken=page_token)
            .execute()
        )
        ids = [ref["id"] for ref in listing.get("messages", [])]
        return {
            "messages": _summaries_for_ids(service, ids),
            "next_page_token": listing.get("nextPageToken"),
        }
    except HttpError as exc:
        raise _wrap_http_error(exc) from exc


def get_message(user: User, db: Session, message_id: str) -> dict:
    try:
        service = _service(user, db)
        message = service.users().messages().get(userId="me", id=message_id, format="full").execute()
    except HttpError as exc:
        raise _wrap_http_error(exc) from exc

    headers = _headers_dict(message.get("payload", {}))
    out = _summary(message)
    out["to_"] = headers.get("To", "")
    out["body_text"] = _extract_body(message.get("payload", {}))
    return out
