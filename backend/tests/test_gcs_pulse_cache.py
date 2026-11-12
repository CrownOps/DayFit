"""GCS Pulse 조회 캐시: 반복 조회는 태평양 왕복 없이, 내가 쓴 변경은 즉시 반영."""
from types import SimpleNamespace

import httpx
import pytest

from app.services import gcs_pulse_client as gcs


@pytest.fixture
def calls(monkeypatch):
    log: list[tuple[str, str]] = []

    def fake_request(user, method, url, **kwargs):
        log.append((method, url))
        if method == "GET" and url == "/meeting-rooms":
            return httpx.Response(200, json=[{"id": 1, "name": "A"}])
        if method == "GET" and url.endswith("/reservations"):
            return httpx.Response(200, json=[{"id": 9}])
        if method == "GET":
            return httpx.Response(200, json={"items": [{"id": len(log)}]})
        if method == "DELETE":
            return httpx.Response(204)
        return httpx.Response(200, json={"id": 1})

    monkeypatch.setattr(gcs, "_request", fake_request)
    return log


def _user(uid=1):
    return SimpleNamespace(id=uid)


def test_repeat_reads_hit_upstream_once(calls):
    user = _user()
    gcs.list_meeting_rooms(user)
    gcs.list_meeting_rooms(user)
    gcs.list_room_reservations(user, 1, "2026-11-13")
    gcs.list_room_reservations(user, 1, "2026-11-13")
    gcs.list_daily_snippets(user, scope="own", limit=1)
    gcs.list_daily_snippets(user, scope="own", limit=1)
    assert len(calls) == 3


def test_cache_is_per_user_and_per_params(calls):
    gcs.list_daily_snippets(_user(1), scope="own", limit=1)
    gcs.list_daily_snippets(_user(2), scope="own", limit=1)
    gcs.list_daily_snippets(_user(1), scope="team", limit=1)
    assert len(calls) == 3


def test_own_writes_invalidate(calls):
    user = _user()
    gcs.list_daily_snippets(user, scope="own", limit=1)
    gcs.create_daily_snippet(user, "오늘")
    gcs.list_daily_snippets(user, scope="own", limit=1)

    gcs.list_room_reservations(user, 1, "2026-11-13")
    gcs.cancel_room_reservation(user, 9)
    gcs.list_room_reservations(user, 1, "2026-11-13")

    gets = [c for c in calls if c[0] == "GET"]
    assert len(gets) == 4


def test_callers_cannot_mutate_the_cached_copy(calls):
    user = _user()
    first = gcs.list_room_reservations(user, 1, "2026-11-13")
    first[0]["meeting_room_name"] = "A"
    assert "meeting_room_name" not in gcs.list_room_reservations(user, 1, "2026-11-13")[0]
