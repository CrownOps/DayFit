import logging
import os

# Google may return more scopes than we requested (e.g. because
# ``include_granted_scopes`` pulls in scopes the user previously granted to this
# OAuth client, such as gmail.send). By default oauthlib raises a ``Warning``
# exception from ``fetch_token`` when the granted scope set differs from what we
# asked for, which surfaces as a 500 on the OAuth callback. Relaxing this makes
# the mismatch a logged warning instead of a hard failure. Must be set before
# oauthlib validates the token response.
os.environ.setdefault("OAUTHLIB_RELAX_TOKEN_SCOPE", "1")

from dataclasses import dataclass  # noqa: E402
from datetime import datetime, timezone  # noqa: E402

from google.auth.transport.requests import Request  # noqa: E402
from google.oauth2.credentials import Credentials  # noqa: E402
from google_auth_oauthlib.flow import Flow  # noqa: E402
from googleapiclient.discovery import build  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.core.security import decrypt_secret, encrypt_secret  # noqa: E402
from app.models.integration import IntegrationSettings  # noqa: E402
from app.models.user import User  # noqa: E402

logger = logging.getLogger(__name__)

SCOPES = [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/gmail.readonly",
]


class GoogleNotConfiguredError(Exception):
    """Raised when the shared Google OAuth client has not been configured yet."""


@dataclass
class GoogleOAuthConfig:
    client_id: str
    client_secret: str
    redirect_uri: str


def get_settings_row(db: Session) -> IntegrationSettings | None:
    return db.get(IntegrationSettings, 1)


def _client_credential_sources(db: Session, user: User | None):
    """Yield (client_id, client_secret) pairs in priority order.

    Per-user credentials come first (each member registers their own Google
    Cloud OAuth client), then an optional app-wide row, then env vars. Each
    source is atomic — both id and secret must be present to be used.
    """
    if user is not None and user.google_client_id and user.google_client_secret_encrypted:
        yield user.google_client_id, decrypt_secret(user.google_client_secret_encrypted)

    row = get_settings_row(db)
    if row and row.google_client_id and row.google_client_secret_encrypted:
        yield row.google_client_id, decrypt_secret(row.google_client_secret_encrypted)

    if settings.google_client_id and settings.google_client_secret:
        yield settings.google_client_id, settings.google_client_secret


def resolve_google_config(
    db: Session, user: User | None = None, request_redirect_uri: str | None = None
) -> GoogleOAuthConfig | None:
    """Effective Google OAuth config for ``user``: their own client first, then
    an app-wide row, then env vars. Returns ``None`` when no complete
    client id/secret pair is available.

    The redirect URI is shared (the backend callback); each user's own Google
    client must register it. ``request_redirect_uri`` is derived from the
    incoming request when neither a stored value nor an env var is set.
    """
    client_id, client_secret = next(_client_credential_sources(db, user), ("", ""))
    if not client_id or not client_secret:
        return None

    row = get_settings_row(db)
    redirect_uri = (
        (row.google_redirect_uri if row and row.google_redirect_uri else "")
        or request_redirect_uri
        or settings.google_redirect_uri
    )
    return GoogleOAuthConfig(client_id=client_id, client_secret=client_secret, redirect_uri=redirect_uri or "")


def build_flow(config: GoogleOAuthConfig, state: str | None = None) -> Flow:
    client_config = {
        "web": {
            "client_id": config.client_id,
            "client_secret": config.client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [config.redirect_uri],
        }
    }
    return Flow.from_client_config(
        client_config,
        scopes=SCOPES,
        redirect_uri=config.redirect_uri,
        state=state,
    )


def get_authorization_url(db: Session, user: User, request_redirect_uri: str | None = None) -> str:
    config = resolve_google_config(db, user, request_redirect_uri)
    if config is None or not config.redirect_uri:
        raise GoogleNotConfiguredError()
    flow = build_flow(config, state=str(user.id))
    auth_url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
    )
    return auth_url


def exchange_code_for_tokens(
    db: Session, code: str, state: str, request_redirect_uri: str | None = None
) -> tuple[int, Credentials]:
    # ``state`` is the user id set when the auth URL was built; resolve that
    # user's own client to exchange the code (tokens are bound to it).
    user = db.get(User, int(state))
    if user is None:
        raise GoogleNotConfiguredError()
    config = resolve_google_config(db, user, request_redirect_uri)
    if config is None or not config.redirect_uri:
        raise GoogleNotConfiguredError()
    flow = build_flow(config, state=state)
    flow.fetch_token(code=code)
    creds = flow.credentials
    if not creds.refresh_token:
        # Without a refresh token we cannot renew access later. This usually
        # means the user had already granted consent (Google only returns a
        # refresh token on first consent unless prompt=consent is forced).
        logger.warning("Google token exchange returned no refresh token for state=%s", state)
    return int(state), creds


def save_credentials(db: Session, user: User, creds: Credentials) -> None:
    user.google_oauth_token_encrypted = encrypt_secret(creds.token)
    if creds.refresh_token:
        user.google_refresh_token_encrypted = encrypt_secret(creds.refresh_token)
    user.google_calendar_connected = True
    db.add(user)
    db.commit()


def _load_credentials(user: User, config: GoogleOAuthConfig) -> Credentials:
    if not user.google_refresh_token_encrypted:
        raise ValueError("User has not connected Google Calendar")

    creds = Credentials(
        token=decrypt_secret(user.google_oauth_token_encrypted) if user.google_oauth_token_encrypted else None,
        refresh_token=decrypt_secret(user.google_refresh_token_encrypted),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=config.client_id,
        client_secret=config.client_secret,
        scopes=SCOPES,
    )
    if not creds.valid:
        creds.refresh(Request())
    return creds


def get_google_credentials(user: User, db: Session) -> Credentials:
    """Load (and refresh if needed) this user's Google credentials.

    Shared by every Google API surface (Calendar, Gmail, ...) since they all
    ride on the same OAuth token/scope set.
    """
    config = resolve_google_config(db, user)
    if config is None:
        raise GoogleNotConfiguredError()
    creds = _load_credentials(user, config)
    if creds.token:
        user.google_oauth_token_encrypted = encrypt_secret(creds.token)
        db.add(user)
        db.commit()
    return creds


def get_calendar_service(user: User, db: Session):
    creds = get_google_credentials(user, db)
    return build("calendar", "v3", credentials=creds)


NO_REMINDERS = {"useDefault": False, "overrides": []}


def list_events(user: User, db: Session, time_min: datetime, time_max: datetime) -> list[dict]:
    """Events across every calendar the user has enabled — not just their own
    primary calendar, but also invited/shared calendars they keep visible.

    Each returned item is annotated with ``_calendarId`` (which calendar it came
    from) and ``_readOnly`` (True when the user only has read access), so the
    caller can route edits and mark invited events as non-editable.
    """
    service = get_calendar_service(user, db)
    time_min_iso = time_min.astimezone(timezone.utc).isoformat()
    time_max_iso = time_max.astimezone(timezone.utc).isoformat()

    calendars = service.calendarList().list().execute().get("items", [])
    items: list[dict] = []
    for cal in calendars:
        # Respect the user's Google visibility choices: skip calendars they've
        # hidden (holidays, week numbers, etc.). Primary is always included.
        if not cal.get("primary") and not cal.get("selected"):
            continue
        cal_id = cal["id"]
        access = cal.get("accessRole", "reader")
        read_only = access in ("reader", "freeBusyReader")
        try:
            result = (
                service.events()
                .list(
                    calendarId=cal_id,
                    timeMin=time_min_iso,
                    timeMax=time_max_iso,
                    singleEvents=True,
                    orderBy="startTime",
                )
                .execute()
            )
        except Exception:
            # One inaccessible calendar shouldn't fail the whole request.
            logger.warning("Failed to list events for calendar %s", cal_id, exc_info=True)
            continue
        for item in result.get("items", []):
            item["_calendarId"] = cal_id
            item["_readOnly"] = read_only
            items.append(item)
    return items


def insert_event(user: User, db: Session, title: str, description: str | None, location: str | None,
                  start_at: datetime, end_at: datetime) -> dict:
    service = get_calendar_service(user, db)
    body = {
        "summary": title,
        "description": description,
        "location": location,
        "start": {"dateTime": start_at.isoformat()},
        "end": {"dateTime": end_at.isoformat()},
        "reminders": NO_REMINDERS,
    }
    return service.events().insert(calendarId="primary", body=body).execute()


def patch_event(
    user: User, db: Session, google_event_id: str, calendar_id: str = "primary", **fields
) -> dict:
    service = get_calendar_service(user, db)
    body: dict = {"reminders": NO_REMINDERS}
    if "title" in fields and fields["title"] is not None:
        body["summary"] = fields["title"]
    if "description" in fields and fields["description"] is not None:
        body["description"] = fields["description"]
    if "location" in fields and fields["location"] is not None:
        body["location"] = fields["location"]
    if "start_at" in fields and fields["start_at"] is not None:
        body["start"] = {"dateTime": fields["start_at"].isoformat()}
    if "end_at" in fields and fields["end_at"] is not None:
        body["end"] = {"dateTime": fields["end_at"].isoformat()}
    return service.events().patch(calendarId=calendar_id, eventId=google_event_id, body=body).execute()


def delete_event(user: User, db: Session, google_event_id: str, calendar_id: str = "primary") -> None:
    service = get_calendar_service(user, db)
    service.events().delete(calendarId=calendar_id, eventId=google_event_id).execute()


def disable_reminders_for_all_events(user: User, db: Session) -> int:
    """F-7: bulk-disable Google Calendar reminders on existing events at first-time connect."""
    service = get_calendar_service(user, db)
    updated = 0
    page_token = None
    while True:
        result = service.events().list(calendarId="primary", pageToken=page_token, singleEvents=True).execute()
        for event in result.get("items", []):
            if event.get("reminders") == NO_REMINDERS:
                continue
            service.events().patch(
                calendarId="primary", eventId=event["id"], body={"reminders": NO_REMINDERS}
            ).execute()
            updated += 1
        page_token = result.get("nextPageToken")
        if not page_token:
            break
    return updated
