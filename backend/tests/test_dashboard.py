"""홈 대시보드 집계 엔드포인트.

핵심 성질: 한 구역이 실패해도 나머지는 그대로 나온다, 실패한 구역은 `failed`로
구분된다(위젯이 "기록 없음"과 "불러오지 못함"을 다르게 보여줘야 하므로),
그리고 워커는 요청 세션을 건드리지 않는다.
"""
from datetime import date, datetime, time, timedelta, timezone

import pytest

from app.api import dashboard as dashboard_api
from app.models.habit import Habit, HabitLog
from app.models.team import Team
from app.services.gcs_pulse_client import GcsPulseError

TODAY = date(2026, 8, 26)
START = datetime(2026, 8, 25, 15, 0, tzinfo=timezone.utc)  # KST 8/26 00:00
END = datetime(2026, 8, 26, 14, 59, 59, tzinfo=timezone.utc)


@pytest.fixture
def member(make_user, login):
    return login(make_user())


@pytest.fixture
def sections(monkeypatch):
    """느린 구역 넷을 스텁으로. 값을 Exception으로 바꾸면 그 구역만 실패한다."""
    state = {
        "events": [],
        "latest_snippet": None,
        "team_health": [],
        "rooms": [],
        "calls": [],
    }

    def _resolve(key):
        state["calls"].append(key)
        value = state[key]
        if isinstance(value, Exception):
            raise value
        return value

    monkeypatch.setattr(
        dashboard_api.calendar_api, "load_events", lambda db, user, s, e, *a: _resolve("events")
    )
    monkeypatch.setattr(
        dashboard_api.snippets_api, "load_latest_snippet", lambda user: _resolve("latest_snippet")
    )
    monkeypatch.setattr(
        dashboard_api.snippets_api, "load_team_health", lambda user, *a: _resolve("team_health")
    )
    monkeypatch.setattr(
        dashboard_api.rooms_api, "load_day_reservations", lambda user, day: _resolve("rooms")
    )
    return state


def _get(client, expect=200):
    response = client.get(
        "/api/dashboard",
        params={"date": TODAY.isoformat(), "start": START.isoformat(), "end": END.isoformat()},
    )
    assert response.status_code == expect, response.text
    return response.json()


def test_returns_every_section_in_one_request(client, db, sections, member):
    db.add(Team(team_id=member.team_id, vision="더 나은 하루", mission="리듬 찾기"))
    habit = Habit(user_id=member.id, name="스트레칭", target_time=time(9, 0))
    db.add(habit)
    db.commit()
    db.add(HabitLog(habit_id=habit.id, date=TODAY, completed=True, streak_count=3))
    db.commit()

    sections["team_health"] = [
        {
            "user_id": member.id,
            "name": "사용자1",
            "date": TODAY,
            "condition_score": 8,
            "has_snippet_today": True,
            "content_preview": "좋음",
        }
    ]

    body = _get(client)

    assert body["failed"] == []
    assert body["vision"]["vision"] == "더 나은 하루"
    assert [h["name"] for h in body["habits"]] == ["스트레칭"]
    assert body["habit_logs"][0]["completed"] is True
    assert body["team_health"][0]["condition_score"] == 8
    assert body["generated_at"]


def test_one_failing_section_does_not_sink_the_rest(client, db, sections, member):
    db.add(Team(team_id=member.team_id, vision="비전", mission="미션"))
    db.commit()
    sections["latest_snippet"] = GcsPulseError(400, "GCS Pulse API 토큰이 등록되어 있지 않습니다")

    body = _get(client)

    assert body["failed"] == ["snippet"]
    assert body["latest_snippet"] is None
    assert body["vision"]["vision"] == "비전", "다른 구역은 그대로 나와야 한다"


def test_every_external_section_can_fail_independently(client, sections, member):
    sections["events"] = RuntimeError("google down")
    sections["latest_snippet"] = GcsPulseError(502, "pulse down")
    sections["team_health"] = GcsPulseError(502, "pulse down")
    sections["rooms"] = GcsPulseError(502, "pulse down")

    body = _get(client)

    assert sorted(body["failed"]) == ["events", "rooms", "snippet", "team_health"]
    assert body["events"] == []
    assert body["room_reservations"] == []
    # 로컬 구역은 멀쩡하다.
    assert body["habits"] == []
    assert "habits" not in body["failed"]


def test_failure_is_distinguishable_from_emptiness(client, sections, member):
    """빈 결과와 실패가 같아 보이면 위젯 문구가 틀린다."""
    empty = _get(client)
    assert empty["team_health"] == [] and empty["failed"] == []

    sections["team_health"] = GcsPulseError(502, "pulse down")
    broken = _get(client)
    assert broken["team_health"] == [] and broken["failed"] == ["team_health"]


def test_uses_the_clients_local_day_not_the_servers(client, db, sections, member):
    """서버는 UTC라 스스로 '오늘'을 계산하면 KST 사용자와 하루가 어긋난다."""
    habit = Habit(user_id=member.id, name="루틴", target_time=time(9, 0))
    db.add(habit)
    db.commit()
    db.add(HabitLog(habit_id=habit.id, date=TODAY, completed=True, streak_count=1))
    db.add(HabitLog(habit_id=habit.id, date=TODAY - timedelta(days=1), completed=True, streak_count=1))
    db.commit()

    body = _get(client)

    assert len(body["habit_logs"]) == 1, "요청한 날짜의 기록만 와야 한다"
    assert body["habit_logs"][0]["date"] == TODAY.isoformat()


def test_rooms_are_asked_for_the_requested_day(client, sections, member):
    _get(client)
    assert "rooms" in sections["calls"]


def test_events_use_the_supplied_window(client, sections, monkeypatch, member):
    seen = {}

    def fake_load_events(db, user, start, end, *args):
        seen["start"], seen["end"] = start, end
        return []

    monkeypatch.setattr(dashboard_api.calendar_api, "load_events", fake_load_events)

    _get(client)

    assert seen["start"] == START
    assert seen["end"] == END


def test_missing_query_params_is_a_validation_error(client, sections, member):
    assert client.get("/api/dashboard").status_code == 422
