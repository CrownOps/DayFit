from datetime import date, time

from pydantic import BaseModel


class HabitCreate(BaseModel):
    name: str
    category: str = ""
    repeat_days: str = ""  # comma-separated 0=Mon..6=Sun, "" = every day
    target_time: time


class HabitUpdate(BaseModel):
    name: str | None = None
    category: str | None = None
    repeat_days: str | None = None
    target_time: time | None = None
    active: bool | None = None


class HabitOut(BaseModel):
    id: int
    name: str
    category: str
    repeat_days: str
    target_time: time
    active: bool

    class Config:
        from_attributes = True


class HabitLogOut(BaseModel):
    id: int
    habit_id: int
    date: date
    completed: bool
    streak_count: int

    class Config:
        from_attributes = True


class HabitStats(BaseModel):
    habit_id: int
    month: str
    total_days: int
    completed_days: int
    completion_rate: float
