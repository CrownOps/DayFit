from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.models.recurring_reservation import (
    RecurringReservationOccurrence,
    RecurringRoomReservation,
)
from app.models.user import User
from app.services import gcs_pulse_client as gcs
from app.services.gcs_pulse_client import GcsPulseError

APP_TIMEZONE = ZoneInfo("Asia/Seoul")

# How many weeks ahead the sweep always keeps booked.
ROLLING_WEEKS = 4


def _occurrence_dates(rule: RecurringRoomReservation, today: date) -> list[date]:
    """Every date matching `rule.weekday` from today through the rolling
    booking horizon, clipped to [rule.starts_on, rule.ends_on]."""
    horizon_end = today + timedelta(weeks=ROLLING_WEEKS)
    start = max(today, rule.starts_on)
    offset = (rule.weekday - start.weekday()) % 7
    d = start + timedelta(days=offset)

    dates: list[date] = []
    while d <= horizon_end:
        if rule.ends_on is not None and d > rule.ends_on:
            break
        dates.append(d)
        d += timedelta(days=7)
    return dates


def ensure_upcoming_bookings(
    db: Session, rule: RecurringRoomReservation | None = None
) -> list[RecurringReservationOccurrence]:
    """Book every not-yet-attempted occurrence for `rule` (or every active rule
    when `rule` is None) within the rolling horizon. A GCS Pulse conflict on one
    date is recorded as "failed" and never retried — it doesn't block the rest.
    """
    today = datetime.now(timezone.utc).date()
    rules = (
        [rule]
        if rule is not None
        else db.query(RecurringRoomReservation)
        .filter(RecurringRoomReservation.active.is_(True))
        .all()
    )

    created: list[RecurringReservationOccurrence] = []
    for r in rules:
        if not r.active:
            continue
        user = db.get(User, r.user_id)
        if user is None:
            continue

        already = {
            occ.occurrence_date
            for occ in db.query(RecurringReservationOccurrence)
            .filter(RecurringReservationOccurrence.rule_id == r.id)
            .all()
        }
        for d in _occurrence_dates(r, today):
            if d in already:
                continue
            start_at = datetime.combine(d, r.start_time, tzinfo=APP_TIMEZONE).astimezone(timezone.utc)
            end_at = datetime.combine(d, r.end_time, tzinfo=APP_TIMEZONE).astimezone(timezone.utc)
            try:
                reservation = gcs.create_room_reservation(
                    user, r.meeting_room_id, start_at.isoformat(), end_at.isoformat(), r.purpose
                )
                occ = RecurringReservationOccurrence(
                    rule_id=r.id,
                    occurrence_date=d,
                    gcs_reservation_id=reservation.get("id"),
                    status="booked",
                )
            except GcsPulseError as exc:
                occ = RecurringReservationOccurrence(
                    rule_id=r.id, occurrence_date=d, status="failed", detail=exc.detail
                )
            db.add(occ)
            db.flush()
            created.append(occ)
    db.commit()
    return created


def cancel_rule(db: Session, rule: RecurringRoomReservation) -> None:
    """Deactivate the rule and cancel every not-yet-passed booked occurrence."""
    rule.active = False
    db.add(rule)

    today = datetime.now(timezone.utc).date()
    user = db.get(User, rule.user_id)
    occurrences = (
        db.query(RecurringReservationOccurrence)
        .filter(
            RecurringReservationOccurrence.rule_id == rule.id,
            RecurringReservationOccurrence.status == "booked",
            RecurringReservationOccurrence.occurrence_date >= today,
        )
        .all()
    )
    for occ in occurrences:
        if occ.gcs_reservation_id is not None and user is not None:
            try:
                gcs.cancel_room_reservation(user, occ.gcs_reservation_id)
            except GcsPulseError:
                pass
        occ.status = "cancelled"
        db.add(occ)
    db.commit()
