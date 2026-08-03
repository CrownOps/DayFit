import base64
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

_NOT_CONNECTED_DETAIL = (
    "Gmail 권한이 없습니다. 설정에서 Google Calendar를 다시 연결해 이메일 권한을 추가하세요."
)


class GmailError(Exception):
    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


def _service(user: User, db: Session):
    try:
        creds = get_google_credentials(user, db, GMAIL_SCOPES)
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
        refs = listing.get("messages", [])
        messages = []
        for ref in refs:
            detail = (
                service.users()
                .messages()
                .get(userId="me", id=ref["id"], format="metadata", metadataHeaders=_METADATA_HEADERS)
                .execute()
            )
            messages.append(_summary(detail))
        return {"messages": messages, "next_page_token": listing.get("nextPageToken")}
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
