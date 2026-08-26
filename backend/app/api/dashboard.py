"""홈 대시보드를 요청 한 번으로 채우는 집계 엔드포인트.

홈은 위젯마다 따로 조회해서 브라우저가 동시에 9건을 쐈다. vCPU 1개짜리 인스턴스에서는
그 요청들이 서로 밀리고, 각 요청마다 인증·DB 세션 준비 비용도 다시 든다.

여기서는 한 번에 받되, 느린 구역(외부 API)은 서버에서 동시에 부른다. 한 구역이
실패해도 나머지는 그대로 나가고, 실패한 구역 이름만 `failed`에 실린다.
"""
import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import date as date_type
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api import calendar as calendar_api
from app.api import meeting_rooms as rooms_api
from app.api import snippets as snippets_api
from app.core.database import SessionLocal, get_db
from app.core.deps import get_current_user
from app.models.habit import Habit, HabitLog
from app.models.team import Team
from app.models.user import User
from app.schemas.calendar import EventOut
from app.schemas.dashboard import DashboardOut
from app.schemas.habit import HabitLogOut, HabitOut
from app.schemas.meeting_room import MeetingRoomReservationWithRoomOut
from app.schemas.team import TeamProfileOut

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

# 외부 API를 치는 구역 수만큼. 로컬 DB 구역은 요청 스레드에서 그냥 처리한다.
_WORKERS = 4


def _section(name: str, call, failed: list[str], default):
    """한 구역을 실행하고, 실패하면 기본값 + `failed` 기록으로 대신한다."""
    try:
        return call()
    except Exception:
        logger.warning("Dashboard section %r failed", name, exc_info=True)
        failed.append(name)
        return default


def _with_own_session(fn):
    """워커용 세션.

    SQLAlchemy 세션은 스레드 간에 공유하면 안 되고, 요청 세션에 붙어 있는 User를
    다른 세션에 add하면 예외가 난다. 그래서 워커는 자기 세션과 자기 User 인스턴스를
    새로 잡는다.
    """

    def run(user_id: int):
        db = SessionLocal()
        try:
            user = db.get(User, user_id)
            if user is None:
                return None
            return fn(db, user)
        finally:
            db.close()

    return run


@router.get("", response_model=DashboardOut)
def get_dashboard(
    date: date_type = Query(..., description="사용자 로컬 기준 오늘 날짜"),
    start: datetime = Query(..., description="오늘 일정 조회 시작 (ISO, 오프셋 포함)"),
    end: datetime = Query(..., description="오늘 일정 조회 끝"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """홈 위젯이 필요한 데이터 전부.

    `date`는 클라이언트의 로컬 날짜다 — 서버(UTC)가 계산하면 KST 사용자에게 하루가
    어긋난다. `start`/`end`는 같은 이유로 오프셋이 붙은 채 넘어온다.
    """
    failed: list[str] = []
    day = date.isoformat()
    user_id = user.id

    # --- 로컬 DB (빠름): 요청 스레드에서 바로 --------------------------------
    def _vision() -> TeamProfileOut | None:
        if not user.team_id:
            return None
        team = db.get(Team, user.team_id)
        if team is None:
            return TeamProfileOut(team_id=user.team_id, vision="", mission="")
        return TeamProfileOut.model_validate(team)

    def _habits() -> list[HabitOut]:
        rows = db.query(Habit).filter(Habit.user_id == user_id).order_by(Habit.target_time).all()
        return [HabitOut.model_validate(row) for row in rows]

    def _habit_logs() -> list[HabitLogOut]:
        habit_ids = [row.id for row in db.query(Habit.id).filter(Habit.user_id == user_id).all()]
        if not habit_ids:
            return []
        rows = (
            db.query(HabitLog)
            .filter(HabitLog.habit_id.in_(habit_ids), HabitLog.date == date)
            .all()
        )
        return [HabitLogOut.model_validate(row) for row in rows]

    # --- 외부 API (느림): 동시에 -------------------------------------------
    @_with_own_session
    def _events(worker_db: Session, worker_user: User) -> list[EventOut]:
        rows = calendar_api.load_events(worker_db, worker_user, start, end)
        # 세션이 닫히기 전에 값으로 굳혀 둔다.
        return [EventOut.model_validate(row) for row in rows]

    @_with_own_session
    def _latest_snippet(worker_db: Session, worker_user: User):
        return snippets_api.load_latest_snippet(worker_user)

    @_with_own_session
    def _team_health(worker_db: Session, worker_user: User):
        return snippets_api.load_team_health(worker_user)

    @_with_own_session
    def _rooms(worker_db: Session, worker_user: User):
        return [
            MeetingRoomReservationWithRoomOut.model_validate(item)
            for item in rooms_api.load_day_reservations(worker_user, day)
        ]

    with ThreadPoolExecutor(max_workers=_WORKERS) as pool:
        pending = {
            "events": pool.submit(_events, user_id),
            "snippet": pool.submit(_latest_snippet, user_id),
            "team_health": pool.submit(_team_health, user_id),
            "rooms": pool.submit(_rooms, user_id),
        }

        # 워커가 도는 동안 로컬 DB 구역을 처리한다.
        vision = _section("vision", _vision, failed, None)
        habits = _section("habits", _habits, failed, [])
        habit_logs = _section("habits", _habit_logs, failed, [])

        events = _section("events", pending["events"].result, failed, [])
        latest_snippet = _section("snippet", pending["snippet"].result, failed, None)
        team_health = _section("team_health", pending["team_health"].result, failed, [])
        rooms = _section("rooms", pending["rooms"].result, failed, [])

    return DashboardOut(
        vision=vision,
        events=events or [],
        habits=habits or [],
        habit_logs=habit_logs or [],
        latest_snippet=latest_snippet,
        team_health=team_health or [],
        room_reservations=rooms or [],
        # 습관 두 구역이 같은 이름을 쓰므로 중복을 없앤다.
        failed=sorted(set(failed)),
        generated_at=datetime.now(timezone.utc),
    )
