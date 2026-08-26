"""최근에 동기화한 구간은 Google을 다시 치지 않고 캐시로 응답하는지."""
from datetime import datetime, timedelta, timezone

import pytest

from app.api import calendar as calendar_api
from app.models.calendar import CalendarSyncState

MONTH_START = datetime(2026, 8, 1, tzinfo=timezone.utc)
MONTH_END = datetime(2026, 9, 1, tzinfo=timezone.utc)
DAY_START = datetime(2026, 8, 15, tzinfo=timezone.utc)
DAY_END = datetime(2026, 8, 16, tzinfo=timezone.utc)


@pytest.fixture
def synced(monkeypatch):
    """Google 호출을 세는 스텁. 매번 구간 한가운데 일정 하나를 돌려준다."""
    calls = {"n": 0}

    def fake_list_events(user, db, start, end):
        calls["n"] += 1
        middle = start + (end - start) / 2
        return [
            {
                "id": "g1",
                "summary": "구글 일정",
                "start": {"dateTime": middle.isoformat()},
                "end": {"dateTime": (middle + timedelta(hours=1)).isoformat()},
                "_calendarId": "primary",
                "_readOnly": False,
            }
        ]

    monkeypatch.setattr(calendar_api.gcal, "list_events", fake_list_events)
    return calls


@pytest.fixture
def connected_user(make_user, login):
    return login(make_user(google_calendar_connected=True))


def _events(client, start, end, refresh=None):
    params = {"start": start.isoformat(), "end": end.isoformat()}
    if refresh is not None:
        params["refresh"] = str(refresh).lower()
    response = client.get("/api/calendar/events", params=params)
    assert response.status_code == 200, response.text
    return response.json()


def test_first_request_syncs_then_serves_from_cache(client, synced, connected_user):
    body = _events(client, MONTH_START, MONTH_END)
    assert synced["n"] == 1
    assert [e["title"] for e in body] == ["구글 일정"]

    body = _events(client, MONTH_START, MONTH_END)
    assert synced["n"] == 1, "같은 구간을 다시 요청하면 캐시로 응답해야 한다"
    assert [e["title"] for e in body] == ["구글 일정"]


def test_narrower_window_inside_a_synced_month_hits_cache(client, synced, connected_user):
    """월간을 한 번 당겨왔으면 그 안의 일간/주간 전환은 왕복이 없어야 한다."""
    _events(client, MONTH_START, MONTH_END)
    _events(client, DAY_START, DAY_END)

    assert synced["n"] == 1


def test_window_outside_the_synced_range_syncs(client, synced, connected_user):
    _events(client, MONTH_START, MONTH_END)
    _events(
        client,
        datetime(2026, 9, 5, tzinfo=timezone.utc),
        datetime(2026, 9, 6, tzinfo=timezone.utc),
    )

    assert synced["n"] == 2


def test_refresh_forces_a_pull(client, synced, connected_user):
    _events(client, MONTH_START, MONTH_END)
    _events(client, MONTH_START, MONTH_END, refresh=True)

    assert synced["n"] == 2, "새로고침은 캐시가 신선해도 다시 가져와야 한다"


def test_expired_ttl_syncs_again(client, db, synced, connected_user):
    _events(client, MONTH_START, MONTH_END)

    expired = datetime.now(timezone.utc) - calendar_api.CALENDAR_SYNC_TTL - timedelta(seconds=5)
    for row in db.query(CalendarSyncState).all():
        row.synced_at = expired
    db.commit()

    _events(client, MONTH_START, MONTH_END)
    assert synced["n"] == 2


def test_resync_does_not_duplicate_events(client, synced, connected_user):
    _events(client, MONTH_START, MONTH_END)
    body = _events(client, MONTH_START, MONTH_END, refresh=True)

    assert len(body) == 1, "재동기화가 같은 일정을 중복 저장하면 안 된다"


def test_sync_bookkeeping_does_not_pile_up(client, db, synced, connected_user):
    """브라우징할 때마다 기록이 무한정 쌓이면 안 된다."""
    _events(client, DAY_START, DAY_END)
    _events(client, MONTH_START, MONTH_END, refresh=True)

    # 일간 기록은 월간에 포함되므로 정리된다.
    assert db.query(CalendarSyncState).count() == 1


def test_disconnected_user_never_syncs(client, synced, make_user, login):
    login(make_user(google_calendar_connected=False))

    assert _events(client, MONTH_START, MONTH_END) == []
    assert synced["n"] == 0
