"""하루치 전체 예약을 한 번에 돌려주는 엔드포인트.

대시보드 위젯이 회의실 목록 + 회의실마다 예약 조회로 1+N 왕복을 하던 걸
1회로 줄인 것.
"""
import pytest

from app.api import meeting_rooms as rooms_api
from app.services.gcs_pulse_client import GcsPulseError

ROOMS = [
    {"id": 1, "name": "대회의실"},
    {"id": 2, "name": "소회의실"},
    {"id": 3, "name": "포커스룸"},
]


def _reservation(reservation_id: int, room_id: int, hour: int) -> dict:
    return {
        "id": reservation_id,
        "meeting_room_id": room_id,
        "reserved_by_user_id": 1,
        "reserved_by_name": "예약자",
        "start_at": f"2026-08-26T{hour:02d}:00:00+09:00",
        "end_at": f"2026-08-26T{hour + 1:02d}:00:00+09:00",
        "purpose": "회의",
        "can_cancel": True,
    }


@pytest.fixture
def pulse(monkeypatch):
    """GCS Pulse 호출을 세는 스텁."""
    state = {"rooms": ROOMS, "by_room": {}, "room_calls": [], "list_rooms_calls": 0}

    def list_meeting_rooms(user):
        state["list_rooms_calls"] += 1
        if isinstance(state["rooms"], Exception):
            raise state["rooms"]
        return state["rooms"]

    def list_room_reservations(user, room_id, day):
        state["room_calls"].append((room_id, day))
        result = state["by_room"].get(room_id, [])
        if isinstance(result, Exception):
            raise result
        return result

    monkeypatch.setattr(rooms_api.gcs, "list_meeting_rooms", list_meeting_rooms)
    monkeypatch.setattr(rooms_api.gcs, "list_room_reservations", list_room_reservations)
    return state


@pytest.fixture
def member(make_user, login):
    return login(make_user())


def _get(client, day="2026-08-26"):
    response = client.get("/api/meeting-rooms/reservations", params={"date": day})
    assert response.status_code == 200, response.text
    return response.json()


def test_returns_every_rooms_reservations_with_room_names(client, pulse, member):
    pulse["by_room"] = {1: [_reservation(10, 1, 9)], 2: [_reservation(20, 2, 14)], 3: []}

    body = _get(client)

    assert {r["id"] for r in body} == {10, 20}
    names = {r["id"]: r["meeting_room_name"] for r in body}
    assert names == {10: "대회의실", 20: "소회의실"}, "회의실 이름을 같이 실어야 한다"


def test_asks_each_room_once_for_the_requested_day(client, pulse, member):
    pulse["by_room"] = {1: [], 2: [], 3: []}

    _get(client, "2026-08-26")

    assert pulse["list_rooms_calls"] == 1
    assert sorted(pulse["room_calls"]) == [
        (1, "2026-08-26"),
        (2, "2026-08-26"),
        (3, "2026-08-26"),
    ]


def test_one_failing_room_does_not_lose_the_day(client, pulse, member):
    pulse["by_room"] = {
        1: [_reservation(10, 1, 9)],
        2: GcsPulseError(502, "회의실 조회 실패"),
        3: [_reservation(30, 3, 16)],
    }

    body = _get(client)

    assert {r["id"] for r in body} == {10, 30}


def test_no_rooms_means_no_reservation_lookups(client, pulse, member):
    pulse["rooms"] = []

    assert _get(client) == []
    assert pulse["room_calls"] == []


def test_room_list_failure_is_surfaced(client, pulse, member):
    pulse["rooms"] = GcsPulseError(400, "GCS Pulse API 토큰이 등록되어 있지 않습니다")

    response = client.get("/api/meeting-rooms/reservations", params={"date": "2026-08-26"})

    assert response.status_code == 400
    assert response.json()["detail"] == "GCS Pulse API 토큰이 등록되어 있지 않습니다"


def test_route_is_not_shadowed_by_the_per_room_route(client, pulse, member):
    """`/reservations`가 `/{room_id}/reservations`에 먹히면 안 된다."""
    pulse["by_room"] = {1: [_reservation(10, 1, 9)], 2: [], 3: []}

    body = _get(client)

    assert body and "meeting_room_name" in body[0]
