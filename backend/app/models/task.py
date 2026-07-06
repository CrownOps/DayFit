from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Task(Base):
    """A lightweight to-do item, scoped to a day ("today") or a week ("week")."""

    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)

    title: Mapped[str] = mapped_column(String(500))
    # "today" -> anchor_date is the specific day; "week" -> anchor_date is the Monday of that week
    scope: Mapped[str] = mapped_column(String(16), default="today")
    anchor_date: Mapped[date] = mapped_column(Date, index=True)

    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
