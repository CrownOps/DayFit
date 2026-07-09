from datetime import date, datetime
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Task(Base):
    """A lightweight to-do item, scoped to a day ("today") or a week ("week").

    A task can also sit in a team's shared pool ("팀 할일"): such a task has no
    owner (``user_id`` is NULL) and belongs to ``team_id``. Any teammate can
    "claim" it, which assigns it to them as a personal today-task.
    """

    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    # NULL while the task sits in a team's shared pool; set to the owner once claimed/created personally.
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    # Set only for unclaimed team-pool tasks; NULL for personal tasks.
    team_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)

    title: Mapped[str] = mapped_column(String(500))
    # "today" -> anchor_date is the specific day; "week" -> anchor_date is the Monday of that week;
    # "team" -> unclaimed shared pool item (anchor_date unused).
    scope: Mapped[str] = mapped_column(String(16), default="today")
    anchor_date: Mapped[date] = mapped_column(Date, index=True)

    # Progress state: "todo" -> "in_progress" -> "done". `completed` is kept in
    # sync (completed == status == "done") for backward compatibility.
    status: Mapped[str] = mapped_column(String(16), default="todo")
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
