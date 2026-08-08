from datetime import date, datetime, time

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Time, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Habit(Base):
    __tablename__ = "habits"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)

    name: Mapped[str] = mapped_column(String(255))
    # free-form grouping label, e.g. "건강", "학습"; empty = uncategorised
    category: Mapped[str] = mapped_column(String(64), default="")
    # comma-separated weekday numbers 0=Mon..6=Sun, empty string = every day
    repeat_days: Mapped[str] = mapped_column(String(32), default="")
    target_time: Mapped[time] = mapped_column(Time)

    active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # A habit almost always accumulates logs the moment it's checked off, so
    # deleting a habit must take its logs with it — otherwise the FK on
    # HabitLog.habit_id blocks the delete outright.
    logs: Mapped[list["HabitLog"]] = relationship(
        back_populates="habit",
        cascade="all, delete-orphan",
    )


class HabitLog(Base):
    __tablename__ = "habit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    habit_id: Mapped[int] = mapped_column(ForeignKey("habits.id", ondelete="CASCADE"), index=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    streak_count: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    habit: Mapped["Habit"] = relationship(back_populates="logs")
