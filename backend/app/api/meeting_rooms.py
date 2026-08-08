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
    MessageOut,
)
from app.schemas.recurring_reservation import RecurringReservationCreate, RecurringReservationOut
from app.services import gcs_pulse_client as gcs
from app.services import recurring_reservation_service
from app.services.gcs_pulse_client import GcsPulseError

router = APIRouter(prefix="/api/meeting-rooms", tags=["meeting-rooms"])


@router.get("", response_model=list[MeetingRoomOut])
def list_rooms(user: User = Depends(get_current_user)):
    try:
        return gcs.list_meeting_rooms(user)
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
