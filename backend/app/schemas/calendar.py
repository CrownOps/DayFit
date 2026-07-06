from datetime import datetime

from pydantic import BaseModel


class EventCreate(BaseModel):
    title: str
    description: str | None = None
    location: str | None = None
    start_at: datetime
    end_at: datetime
    reminder_minutes_before: int | None = None


class EventUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    location: str | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None
    reminder_minutes_before: int | None = None


class EventOut(BaseModel):
    id: int
    google_event_id: str | None
    title: str
    description: str | None
    location: str | None
    start_at: datetime
    end_at: datetime
    reminder_minutes_before: int | None
    source: str

    class Config:
        from_attributes = True


class GoogleAuthUrlOut(BaseModel):
    auth_url: str
