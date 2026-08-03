from datetime import date, datetime
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Task(Base):
    """A lightweight to-do item, scoped to a day ("today") or a week ("week").

    A task can also sit in a team's shared pool ("팀 할 일"): such a task belongs
    to ``team_id`` and is available while ``user_id`` is NULL. When a teammate
    "claims" it, ``user_id`` is set to them and ``claimed_at`` is stamped — but
    ``team_id`` stays set so the claim is kept as a restorable record. Restoring
    clears ``user_id``/``claimed_at`` and returns it to the pool.
    """

    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    # NULL while a team-pool task is unclaimed; set to the owner once claimed/created personally.
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    # Set for team-pool tasks (available AND claimed); NULL for purely personal tasks.
    team_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    # When a team-pool task was claimed (NULL while available or for personal tasks).
    claimed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    # Set when this task was created from a calendar event ("일정 할일"); stays set
    # even after the task is promoted to "week" so the event modal can still list it.
    calendar_event_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("calendar_events_cache.id"), nullable=True, index=True
    )

    title: Mapped[str] = mapped_column(String(500))
    # "today" -> anchor_date is the specific day; "week" -> anchor_date is the Monday of that week;
    # "team" -> unclaimed shared pool item (anchor_date unused); "event" -> attached to a calendar
    # event, not yet promoted into "week" (hidden from both today/week columns until then).
    scope: Mapped[str] = mapped_column(String(16), default="today")
    anchor_date: Mapped[date] = mapped_column(Date, index=True)

    # Progress state: "todo" -> "in_progress" -> "done". `completed` is kept in
    # sync (completed == status == "done") for backward compatibility.
    status: Mapped[str] = mapped_column(String(16), default="todo")
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
