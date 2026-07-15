from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.meeting_room import (
    MeetingRoomOut,
    MeetingRoomReservationCreate,
    MeetingRoomReservationOut,
    MessageOut,
)
from app.services import gcs_pulse_client as gcs
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
        return gcs.cancel_room_reservation(user, reservation_id)
    except GcsPulseError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)
