from datetime import date, time

from pydantic import BaseModel, ConfigDict, Field, model_validator


class RecurringReservationCreate(BaseModel):
    meeting_room_id: int
    weekday: int = Field(ge=0, le=6)
    start_time: time
    end_time: time
    purpose: str | None = None
    starts_on: date
    ends_on: date | None = None

    @model_validator(mode="after")
    def _end_after_start(self):
        if self.end_time <= self.start_time:
            raise ValueError("종료 시간은 시작 시간보다 이후여야 합니다.")
        if self.ends_on is not None and self.ends_on < self.starts_on:
            raise ValueError("종료일은 시작일보다 이후여야 합니다.")
        return self


class OccurrenceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    occurrence_date: date
    status: str
    detail: str | None = None


class RecurringReservationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    meeting_room_id: int
    weekday: int
    start_time: time
    end_time: time
    purpose: str | None = None
    starts_on: date
    ends_on: date | None = None
    active: bool
    occurrences: list[OccurrenceOut] = []
