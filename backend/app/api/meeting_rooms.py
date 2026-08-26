import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.recurring_reservation import (
    RecurringReservationOccurrence,
    RecurringRoomReservation,
)
from app.models.user import User
from app.schemas.meeting_room import (
    MeetingRoomOut,
    MeetingRoomReservationCreate,
    MeetingRoomReservationOut,
    MeetingRoomReservationWithRoomOut,
    MessageOut,
)
from app.schemas.recurring_reservation import RecurringReservationCreate, RecurringReservationOut
from app.services import gcs_pulse_client as gcs
from app.services import recurring_reservation_service
from app.services.gcs_pulse_client import GcsPulseError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/meeting-rooms", tags=["meeting-rooms"])

# GCS Pulse only exposes reservations per room, so the day view still needs one
# upstream call per room — but they are independent, so they go out together
# instead of one after another. Bounded because the API host is a single small
# instance.
_ROOM_FETCH_WORKERS = 5


@router.get("", response_model=list[MeetingRoomOut])
def list_rooms(user: User = Depends(get_current_user)):
    try:
        return gcs.list_meeting_rooms(user)
    except GcsPulseError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)


def load_day_reservations(user: User, day: str) -> list[dict]:
    """Every room's reservations for `day` (ISO date), fetched concurrently.

    Raises GcsPulseError only when the room list itself fails; a single room
    failing yields an empty list for that room.
    """
    rooms = gcs.list_meeting_rooms(user)
    if not rooms:
        return []

    def fetch(room: dict) -> list[dict]:
        try:
            reservations = gcs.list_room_reservations(user, room["id"], day)
        except GcsPulseError:
            logger.warning("Failed to list reservations for room %s", room.get("id"), exc_info=True)
            return []
        for reservation in reservations:
            reservation["meeting_room_name"] = room.get("name")
        return reservations

    with ThreadPoolExecutor(max_workers=min(_ROOM_FETCH_WORKERS, len(rooms))) as pool:
        per_room = list(pool.map(fetch, rooms))

    return [reservation for reservations in per_room for reservation in reservations]


@router.get("/reservations", response_model=list[MeetingRoomReservationWithRoomOut])
def list_all_reservations(
    date: date = Query(...),
    user: User = Depends(get_current_user),
):
    """Every room's reservations for one day, in a single request.

    The dashboard used to fetch the room list and then one request per room, so
    a team with five rooms paid six browser round trips for one small widget.
    """
    try:
        return load_day_reservations(user, date.isoformat())
    except GcsPulseError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)


@router.get("/{room_id}/reservations", response_model=list[MeetingRoomReservationOut])
def list_reservations(
    room_id: int,
    date: date = Query(...),
    user: User = Depends(get_current_user),
):
    try:
        return gcs.list_room_reservations(user, room_id, date.isoformat())
    except GcsPulseError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)


@router.post("/{room_id}/reservations", response_model=MeetingRoomReservationOut)
def create_reservation(
    room_id: int,
    payload: MeetingRoomReservationCreate,
    user: User = Depends(get_current_user),
):
    try:
        return gcs.create_room_reservation(
            user,
            room_id,
            payload.start_at.isoformat(),
            payload.end_at.isoformat(),
            payload.purpose,
        )
    except GcsPulseError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)


@router.delete("/reservations/{reservation_id}", response_model=MessageOut)
def cancel_reservation(reservation_id: int, user: User = Depends(get_current_user)):
    try:
        gcs.cancel_room_reservation(user, reservation_id)
    except GcsPulseError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)
    return {"message": "예약이 취소되었습니다"}


# ---- Recurring reservations ("정기예약") --------------------------------
#
# GCS Pulse has no notion of recurrence, so a rule is kept locally and a daily
# scheduler sweep (see `recurring_reservation_service` + `notification_scheduler`)
# creates the individual GCS Pulse reservations for the rolling booking horizon.


def _rule_out(db: Session, rule: RecurringRoomReservation) -> RecurringReservationOut:
    occurrences = (
        db.query(RecurringReservationOccurrence)
        .filter(RecurringReservationOccurrence.rule_id == rule.id)
        .order_by(RecurringReservationOccurrence.occurrence_date)
        .all()
    )
    out = RecurringReservationOut.model_validate(rule)
    out.occurrences = list(occurrences)
    return out


@router.get("/recurring", response_model=list[RecurringReservationOut])
def list_recurring_reservations(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    rules = (
        db.query(RecurringRoomReservation)
        .filter(RecurringRoomReservation.user_id == user.id)
        .order_by(RecurringRoomReservation.created_at.desc())
        .all()
    )
    return [_rule_out(db, r) for r in rules]


@router.post("/recurring", response_model=RecurringReservationOut)
def create_recurring_reservation(
    payload: RecurringReservationCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rule = RecurringRoomReservation(
        user_id=user.id,
        meeting_room_id=payload.meeting_room_id,
        weekday=payload.weekday,
        start_time=payload.start_time,
        end_time=payload.end_time,
        purpose=payload.purpose,
        starts_on=payload.starts_on,
        ends_on=payload.ends_on,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)

    # Book the rolling horizon immediately so the user sees results right away
    # instead of waiting for tomorrow's scheduler sweep.
    recurring_reservation_service.ensure_upcoming_bookings(db, rule)
    return _rule_out(db, rule)


@router.delete("/recurring/{rule_id}", response_model=MessageOut)
def cancel_recurring_reservation(
    rule_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    rule = db.get(RecurringRoomReservation, rule_id)
    if rule is None or rule.user_id != user.id:
        raise HTTPException(status_code=404, detail="정기예약을 찾을 수 없습니다")
    recurring_reservation_service.cancel_rule(db, rule)
    return {"message": "정기예약이 취소되었습니다"}
