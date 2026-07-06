from datetime import datetime, timezone

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import decrypt_secret, encrypt_secret
from app.models.user import User

SCOPES = ["https://www.googleapis.com/auth/calendar"]


def build_flow(state: str | None = None) -> Flow:
    client_config = {
        "web": {
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [settings.google_redirect_uri],
        }
    }
    return Flow.from_client_config(
        client_config,
        scopes=SCOPES,
        redirect_uri=settings.google_redirect_uri,
        state=state,
    )


def get_authorization_url(user_id: int) -> str:
    flow = build_flow(state=str(user_id))
    auth_url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
    )
    return auth_url


def exchange_code_for_tokens(code: str, state: str) -> tuple[int, Credentials]:
    flow = build_flow(state=state)
    flow.fetch_token(code=code)
    return int(state), flow.credentials


def save_credentials(db: Session, user: User, creds: Credentials) -> None:
    user.google_oauth_token_encrypted = encrypt_secret(creds.token)
    if creds.refresh_token:
        user.google_refresh_token_encrypted = encrypt_secret(creds.refresh_token)
    user.google_calendar_connected = True
    db.add(user)
    db.commit()


def _load_credentials(user: User) -> Credentials:
    if not user.google_refresh_token_encrypted:
        raise ValueError("User has not connected Google Calendar")

    creds = Credentials(
        token=decrypt_secret(user.google_oauth_token_encrypted) if user.google_oauth_token_encrypted else None,
        refresh_token=decrypt_secret(user.google_refresh_token_encrypted),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        scopes=SCOPES,
    )
    if not creds.valid:
        creds.refresh(Request())
    return creds


def get_calendar_service(user: User, db: Session):
    creds = _load_credentials(user)
    if creds.token:
        user.google_oauth_token_encrypted = encrypt_secret(creds.token)
        db.add(user)
        db.commit()
    return build("calendar", "v3", credentials=creds)


NO_REMINDERS = {"useDefault": False, "overrides": []}


def list_events(user: User, db: Session, time_min: datetime, time_max: datetime) -> list[dict]:
    service = get_calendar_service(user, db)
    result = (
        service.events()
        .list(
            calendarId="primary",
            timeMin=time_min.astimezone(timezone.utc).isoformat(),
            timeMax=time_max.astimezone(timezone.utc).isoformat(),
            singleEvents=True,
            orderBy="startTime",
        )
        .execute()
    )
    return result.get("items", [])


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


def patch_event(user: User, db: Session, google_event_id: str, **fields) -> dict:
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
    return service.events().patch(calendarId="primary", eventId=google_event_id, body=body).execute()


def delete_event(user: User, db: Session, google_event_id: str) -> None:
    service = get_calendar_service(user, db)
    service.events().delete(calendarId="primary", eventId=google_event_id).execute()


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
