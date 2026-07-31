import logging
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models.calendar import CalendarEventCache
from app.models.habit import Habit
from app.models.push import NotificationSchedule
from app.services import recurring_reservation_service
from app.services.habit_service import is_scheduled_day
from app.services.push_service import send_to_user

logger = logging.getLogger(__name__)

APP_TIMEZONE = ZoneInfo("Asia/Seoul")

_scheduler: BackgroundScheduler | None = None


def _already_notified(db: Session, source_type: str, source_id: int, fire_at: datetime) -> bool:
    day_start = fire_at.replace(hour=0, minute=0, second=0, microsecond=0)
    day_end = day_start + timedelta(days=1)
    return (
        db.query(NotificationSchedule)
        .filter(
            NotificationSchedule.source_type == source_type,
            NotificationSchedule.source_id == source_id,
            NotificationSchedule.fire_at >= day_start,
            NotificationSchedule.fire_at < day_end,
            NotificationSchedule.status == "sent",
        )
        .first()
        is not None
    )


def _check_calendar_reminders(db: Session, now: datetime) -> None:
    events = (
        db.query(CalendarEventCache)
        .filter(CalendarEventCache.reminder_minutes_before.isnot(None))
        .filter(CalendarEventCache.start_at >= now, CalendarEventCache.start_at <= now + timedelta(hours=24))
        .all()
    )
    for event in events:
        fire_at = event.start_at - timedelta(minutes=event.reminder_minutes_before)
        if fire_at > now or fire_at < now - timedelta(minutes=1):
            continue
        if _already_notified(db, "calendar_event", event.id, fire_at):
            continue

        entry = NotificationSchedule(
            user_id=event.user_id,
            source_type="calendar_event",
            source_id=event.id,
            fire_at=fire_at,
            title="일정 알림",
            body=f"{event.title} — {event.reminder_minutes_before}분 후 시작",
        )
        db.add(entry)
        db.flush()

        send_to_user(db, event.user_id, entry.title, entry.body, url=f"/calendar/{event.id}")
        entry.sent_at = datetime.now(timezone.utc)
        entry.status = "sent"
        db.add(entry)
        db.commit()


def _check_habit_reminders(db: Session, now: datetime) -> None:
    habits = db.query(Habit).filter(Habit.active.is_(True)).all()
    now_local = now.astimezone(APP_TIMEZONE)
    today = now_local.date()

    for habit in habits:
        if not is_scheduled_day(habit, today):
            continue

        fire_at_local = datetime.combine(today, habit.target_time, tzinfo=APP_TIMEZONE)
        if fire_at_local > now_local or fire_at_local < now_local - timedelta(minutes=1):
            continue

        fire_at = fire_at_local.astimezone(timezone.utc)
        if _already_notified(db, "habit", habit.id, fire_at):
            continue

        entry = NotificationSchedule(
            user_id=habit.user_id,
            source_type="habit",
            source_id=habit.id,
            fire_at=fire_at,
            title="습관 알림",
            body=f"'{habit.name}' 체크할 시간이에요",
        )
        db.add(entry)
        db.flush()

        send_to_user(db, habit.user_id, entry.title, entry.body, url=f"/habits/{habit.id}")
        entry.sent_at = datetime.now(timezone.utc)
        entry.status = "sent"
        db.add(entry)
        db.commit()


def run_notification_sweep() -> None:
    now = datetime.now(timezone.utc)
    db = SessionLocal()
    try:
        _check_calendar_reminders(db, now)
        _check_habit_reminders(db, now)
    except Exception:
        logger.exception("Notification sweep failed")
    finally:
        db.close()


def run_recurring_reservation_sweep() -> None:
    db = SessionLocal()
    try:
        recurring_reservation_service.ensure_upcoming_bookings(db)
    except Exception:
        logger.exception("Recurring reservation sweep failed")
    finally:
        db.close()


def start_scheduler() -> BackgroundScheduler:
    global _scheduler
    if _scheduler is not None:
        return _scheduler

    _scheduler = BackgroundScheduler(timezone="UTC")
    _scheduler.add_job(run_notification_sweep, "interval", minutes=1, id="notification_sweep")
    _scheduler.add_job(
        run_recurring_reservation_sweep,
        "interval",
        hours=24,
        id="recurring_reservations",
        next_run_time=datetime.now(timezone.utc),
    )
    _scheduler.start()
    return _scheduler


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
