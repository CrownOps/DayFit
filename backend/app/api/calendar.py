import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.calendar import CalendarEventCache
from app.models.user import User
from app.schemas.calendar import EventCreate, EventOut, EventUpdate, GoogleAuthUrlOut
from app.services import google_calendar as gcal

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/calendar", tags=["calendar"])


def _callback_url(request: Request) -> str:
    """Absolute URL of the OAuth callback, derived from the incoming request.

    Used as a fallback redirect URI so the flow works even before an admin sets
    one explicitly. Requires the app to run behind ``--proxy-headers`` so the
    scheme is https in production.
    """
    return str(request.url_for("oauth_callback"))


@router.get("/oauth/authorize", response_model=GoogleAuthUrlOut)
def authorize(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        return GoogleAuthUrlOut(auth_url=gcal.get_authorization_url(db, user, _callback_url(request)))
    except gcal.GoogleNotConfiguredError:
        raise HTTPException(
            status_code=400,
            detail="Google 연동이 설정되지 않았습니다. 설정에서 본인 Google API(Client ID/Secret)를 먼저 입력하세요.",
        )


@router.get("/oauth/callback")
def oauth_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: Session = Depends(get_db),
):
    if error or not code or not state:
        # User denied consent, or Google redirected without an auth code.
        logger.info("Google OAuth callback without code (error=%s, state=%s)", error, state)
        return RedirectResponse(url=f"{settings.frontend_url}/settings?calendar=error")

    try:
        user_id, creds = gcal.exchange_code_for_tokens(db, code, state, _callback_url(request))
    except gcal.GoogleNotConfiguredError:
        return RedirectResponse(url=f"{settings.frontend_url}/settings?calendar=not_configured")
    except Exception:
        # Any failure exchanging the code (invalid/expired code, redirect_uri
        # mismatch, network error to Google's token endpoint, etc.) should send
        # the user back to settings with an error rather than a bare 500.
        logger.exception("Google OAuth token exchange failed for state=%s", state)
        return RedirectResponse(url=f"{settings.frontend_url}/settings?calendar=error")

    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    try:
        gcal.save_credentials(db, user, creds)
    except Exception:
        logger.exception("Failed to save Google credentials for user_id=%s", user_id)
        return RedirectResponse(url=f"{settings.frontend_url}/settings?calendar=error")

    try:
        gcal.disable_reminders_for_all_events(user, db)
    except Exception:
        # Reminder cleanup is best-effort; credentials are already saved, so the
        # connection succeeded even if this step fails.
        logger.exception("Failed to disable existing reminders for user_id=%s", user_id)

    return RedirectResponse(url=f"{settings.frontend_url}/settings?calendar=connected")


def _to_cache_row(user_id: int, item: dict) -> CalendarEventCache:
    start = item.get("start", {})
    end = item.get("end", {})
    start_at = datetime.fromisoformat((start.get("dateTime") or start.get("date")).replace("Z", "+00:00"))
    end_at = datetime.fromisoformat((end.get("dateTime") or end.get("date")).replace("Z", "+00:00"))
    return CalendarEventCache(
        user_id=user_id,
        google_event_id=item["id"],
        title=item.get("summary", "(제목 없음)"),
        description=item.get("description"),
        location=item.get("location"),
        start_at=start_at,
        end_at=end_at,
        source="google",
    )


@router.get("/events", response_model=list[EventOut])
def get_events(
    start: datetime = Query(default_factory=lambda: datetime.now(timezone.utc)),
    end: datetime | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if end is None:
        end = start + timedelta(days=1)

    if user.google_calendar_connected:
        items = gcal.list_events(user, db, start, end)
        db.query(CalendarEventCache).filter(
            CalendarEventCache.user_id == user.id,
            CalendarEventCache.source == "google",
            CalendarEventCache.start_at >= start,
            CalendarEventCache.start_at < end,
        ).delete()
        rows = [_to_cache_row(user.id, item) for item in items]
        db.add_all(rows)
        db.commit()

    cached = (
        db.query(CalendarEventCache)
        .filter(
            CalendarEventCache.user_id == user.id,
            CalendarEventCache.start_at >= start,
            CalendarEventCache.start_at < end,
        )
        .order_by(CalendarEventCache.start_at)
        .all()
    )
    return cached


@router.post("/events", response_model=EventOut)
def create_event(payload: EventCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    google_event_id = None
    if user.google_calendar_connected:
        created = gcal.insert_event(
            user, db, payload.title, payload.description, payload.location, payload.start_at, payload.end_at
        )
        google_event_id = created["id"]

    row = CalendarEventCache(
        user_id=user.id,
        google_event_id=google_event_id,
        title=payload.title,
        description=payload.description,
        location=payload.location,
        start_at=payload.start_at,
        end_at=payload.end_at,
        reminder_minutes_before=payload.reminder_minutes_before,
        source="google" if google_event_id else "local",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.patch("/events/{event_id}", response_model=EventOut)
def update_event(
    event_id: int, payload: EventUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    row = db.get(CalendarEventCache, event_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(status_code=404, detail="Event not found")

    fields = payload.model_dump(exclude_unset=True)

    if row.google_event_id and user.google_calendar_connected:
        gcal.patch_event(user, db, row.google_event_id, **fields)

    for key, value in fields.items():
        setattr(row, key, value)

    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/events/{event_id}", status_code=204)
def delete_event(event_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.get(CalendarEventCache, event_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(status_code=404, detail="Event not found")

    if row.google_event_id and user.google_calendar_connected:
        gcal.delete_event(user, db, row.google_event_id)

    db.delete(row)
    db.commit()
