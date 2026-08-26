from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class CalendarEventCache(Base):
    __tablename__ = "calendar_events_cache"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    google_event_id: Mapped[str | None] = mapped_column(String(255), index=True, nullable=True)

    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    reminder_minutes_before: Mapped[int | None] = mapped_column(Integer, nullable=True)

    source: Mapped[str] = mapped_column(String(32), default="google")

    # Which Google calendar this event lives on (invited/shared calendars use their
    # own id, not "primary"), so edits/deletes can be routed to the right calendar.
    calendar_id: Mapped[str] = mapped_column(String(255), default="primary")
    # True for calendars where the user only has read access (e.g. invited
    # calendars) — such events are shown but not editable.
    read_only: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class CalendarSyncState(Base):
    """When a window of the user's Google calendar was last pulled.

    ``calendar_events_cache`` alone can't answer "have we synced this range?" —
    an empty range and a never-synced range look identical. One row per synced
    window lets a request that is already covered by a recent sync be served
    straight from the cache instead of paying a Google round trip every time
    the user changes date or switches 월간/주간/일간.
    """

    __tablename__ = "calendar_sync_state"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)

    range_start: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    range_end: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
