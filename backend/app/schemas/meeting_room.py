from datetime import datetime

from pydantic import BaseModel, model_validator

_END_BEFORE_START = "종료 시간은 시작 시간보다 이후여야 합니다."


class MeetingRoomOut(BaseModel):
    id: int
    name: str
    location: str | None = None
    description: str | None = None
    image_url: str | None = None


class MeetingRoomReservationOut(BaseModel):
    id: int
    meeting_room_id: int
    reserved_by_user_id: int
    reserved_by_name: str | None = None
    start_at: datetime
    end_at: datetime
    purpose: str | None = None
    can_cancel: bool = False


class MeetingRoomReservationWithRoomOut(MeetingRoomReservationOut):
    """하루치 전체 예약을 한 번에 돌려줄 때 쓰는 형태.

    회의실 이름을 같이 실어 보내서, 호출한 쪽이 회의실 목록을 따로 받아
    맞춰볼 필요가 없게 한다.
    """

    meeting_room_name: str | None = None


class MeetingRoomReservationCreate(BaseModel):
    start_at: datetime
    end_at: datetime
    purpose: str | None = None

    @model_validator(mode="after")
    def _end_after_start(self):
        if self.end_at <= self.start_at:
            raise ValueError(_END_BEFORE_START)
        return self


class MessageOut(BaseModel):
    message: str
