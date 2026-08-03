from datetime import date, datetime, time
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Time, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class RecurringRoomReservation(Base):
    """A weekly recurring booking rule for a GCS Pulse meeting room.

    GCS Pulse itself only supports one-off reservations, so this rule is kept
    locally and a scheduler (`recurring_reservation_service.ensure_upcoming_bookings`)
    periodically creates the individual occurrences on GCS Pulse.
    """

    __tablename__ = "recurring_room_reservations"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    # Room lives in the external GCS Pulse service, not a local table.
    meeting_room_id: Mapped[int] = mapped_column(Integer)

    weekday: Mapped[int] = mapped_column(Integer)  # 0=Mon .. 6=Sun
    start_time: Mapped[time] = mapped_column(Time)
    end_time: Mapped[time] = mapped_column(Time)
    purpose: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    starts_on: Mapped[date] = mapped_column(Date)
    ends_on: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class RecurringReservationOccurrence(Base):
    """One concrete week's booking attempt for a recurring rule.

    Recorded whether it succeeded or failed so the sweep never retries (or
    double-books) a date it already attempted.
    """

    __tablename__ = "recurring_reservation_occurrences"

    id: Mapped[int] = mapped_column(primary_key=True)
    rule_id: Mapped[int] = mapped_column(
        ForeignKey("recurring_room_reservations.id"), index=True
    )
    occurrence_date: Mapped[date] = mapped_column(Date, index=True)
    # GCS Pulse reservation id, when booking succeeded.
    gcs_reservation_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="booked")  # booked|failed|cancelled
    detail: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
