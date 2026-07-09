from datetime import datetime

from pydantic import BaseModel, model_validator

_END_BEFORE_START = "종료 시간은 시작 시간보다 이후여야 합니다."


class EventCreate(BaseModel):
    title: str
    description: str | None = None
    location: str | None = None
    start_at: datetime
    end_at: datetime
    reminder_minutes_before: int | None = None

    @model_validator(mode="after")
    def _end_after_start(self):
        # Google rejects a zero/negative-length event with a 400
        # ("The specified time range is empty."); catch it here as a clean 422.
        if self.end_at <= self.start_at:
            raise ValueError(_END_BEFORE_START)
        return self


class EventUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    location: str | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None
    reminder_minutes_before: int | None = None

    @model_validator(mode="after")
    def _end_after_start(self):
        if self.start_at is not None and self.end_at is not None and self.end_at <= self.start_at:
            raise ValueError(_END_BEFORE_START)
        return self


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
    read_only: bool = False

    class Config:
        from_attributes = True


class GoogleAuthUrlOut(BaseModel):
    auth_url: str
