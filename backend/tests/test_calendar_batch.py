"""캘린더별 events.list가 순차 왕복이 아니라 배치 한 번으로 나가는지."""
import types
from datetime import datetime, timezone

from googleapiclient.errors import HttpError

from app.services import google_calendar as gcal
from tests.fakes import BatchLog, FakeBatch

WINDOW_START = datetime(2026, 8, 1, tzinfo=timezone.utc)
WINDOW_END = datetime(2026, 9, 1, tzinfo=timezone.utc)


def _http_error(status: int = 403) -> HttpError:
    return HttpError(types.SimpleNamespace(status=status, reason="Forbidden"), b"nope")


def _event(event_id: str) -> dict:
    return {"id": event_id, "summary": event_id}


class FakeCalendar:
    def __init__(self, calendar_list: list[dict], events: dict, log: BatchLog):
        self._calendar_list = calendar_list
        self._events = events
        self._log = log
        self.calendar_list_calls = 0

    # calendarList().list().execute()
    def calendarList(self):
        return self

    def list(self, **kwargs):
        if not kwargs:
            self.calendar_list_calls += 1
            return _Executable({"items": self._calendar_list})
        # events().list(...) — 이건 실행되지 않고 배치에 담긴다. 배치는 담긴
        # 요청을 그대로 콜백에 응답으로 넘기므로 여기서는 응답 본문을 돌려준다.
        assert kwargs["singleEvents"] is True
        assert kwargs["orderBy"] == "startTime"
        calendar_id = kwargs["calendarId"]
        self._log.requested.append(calendar_id)
        return self._events[calendar_id]

    def events(self):
        return self

    def new_batch_http_request(self, callback=None):
        return FakeBatch(callback, self._log)


class _Executable:
    def __init__(self, payload):
        self._payload = payload

    def execute(self):
        return self._payload


def _build(monkeypatch, calendar_list, events):
    log = BatchLog()
    service = FakeCalendar(calendar_list, events, log)
    monkeypatch.setattr(gcal, "get_calendar_service", lambda user, db: service)
    return service, log


def test_one_batch_for_every_visible_calendar(monkeypatch):
    service, log = _build(
        monkeypatch,
        [
            {"id": "primary@x", "primary": True, "accessRole": "owner"},
            {"id": "team@g", "selected": True, "accessRole": "reader"},
            {"id": "hidden@g", "selected": False, "accessRole": "reader"},
        ],
        {
            "primary@x": {"items": [_event("a")]},
            "team@g": {"items": [_event("b")]},
        },
    )

    items = gcal.list_events(None, None, WINDOW_START, WINDOW_END)

    assert service.calendar_list_calls == 1
    assert log.http_calls == 1, f"배치 1회여야 하는데 {log.http_calls}회"
    assert log.sizes == [2]
    assert sorted(log.requested) == ["primary@x", "team@g"], "숨긴 캘린더는 빼야 한다"

    by_id = {item["id"]: item for item in items}
    assert by_id["a"]["_calendarId"] == "primary@x"
    assert by_id["a"]["_readOnly"] is False, "owner 캘린더는 편집 가능해야 한다"
    assert by_id["b"]["_calendarId"] == "team@g"
    assert by_id["b"]["_readOnly"] is True, "reader 캘린더는 읽기 전용이어야 한다"


def test_one_broken_calendar_keeps_the_rest(monkeypatch):
    _build(
        monkeypatch,
        [
            {"id": "primary@x", "primary": True, "accessRole": "owner"},
            {"id": "broken@g", "selected": True, "accessRole": "reader"},
        ],
        {"primary@x": {"items": [_event("a")]}, "broken@g": _http_error()},
    )

    items = gcal.list_events(None, None, WINDOW_START, WINDOW_END)

    assert [item["id"] for item in items] == ["a"]


def test_no_visible_calendars_makes_no_batch(monkeypatch):
    _, log = _build(monkeypatch, [{"id": "hidden@g", "selected": False}], {})

    assert gcal.list_events(None, None, WINDOW_START, WINDOW_END) == []
    assert log.batches == 0, "빈 배치를 열면 안 된다"
