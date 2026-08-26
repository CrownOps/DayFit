from datetime import datetime

from pydantic import BaseModel

from app.schemas.calendar import EventOut
from app.schemas.habit import HabitLogOut, HabitOut
from app.schemas.meeting_room import MeetingRoomReservationWithRoomOut
from app.schemas.snippet import SnippetOut, TeamHealthEntry
from app.schemas.team import TeamProfileOut


class DashboardOut(BaseModel):
    """홈 화면이 필요로 하는 것 전부.

    한 구역이 실패해도 나머지는 그대로 온다. 실패한 구역은 빈 값으로 오고
    이름이 `failed`에 실리는데, 위젯이 "기록 없음"과 "불러오지 못함"을 구분해서
    보여줘야 하기 때문이다(예: 스니펫 위젯의 "작성된 스니펫이 없어요" vs
    "GCS Pulse 연동이 필요합니다").
    """

    vision: TeamProfileOut | None = None
    events: list[EventOut] = []
    habits: list[HabitOut] = []
    habit_logs: list[HabitLogOut] = []
    latest_snippet: SnippetOut | None = None
    team_health: list[TeamHealthEntry] = []
    room_reservations: list[MeetingRoomReservationWithRoomOut] = []

    # 실패한 구역 이름: "vision" | "events" | "habits" | "snippet" | "team_health" | "rooms"
    failed: list[str] = []

    # 서버가 이 응답을 만든 시각 (디버깅·표시용).
    generated_at: datetime
