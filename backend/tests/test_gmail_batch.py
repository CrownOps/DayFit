"""Gmail 목록이 메시지 수만큼 순차 왕복하지 않고 배치 한 번으로 끝나는지."""
import types

import pytest
from googleapiclient.errors import HttpError

from app.services import gmail_service as gs
from tests.fakes import BatchLog, FakeBatch


def _message(message_id: str, subject: str = "제목") -> dict:
    return {
        "id": message_id,
        "threadId": f"t{message_id}",
        "snippet": "본문 미리보기",
        "labelIds": ["INBOX", "UNREAD"],
        "internalDate": "1756000000000",
        "payload": {
            "headers": [
                {"name": "Subject", "value": subject},
                {"name": "From", "value": "a@b.com"},
                {"name": "To", "value": "me@b.com"},
            ]
        },
    }


def _http_error(status: int = 404) -> HttpError:
    return HttpError(types.SimpleNamespace(status=status, reason="Not Found"), b"nope")


class FakeGmail:
    """users().messages().list/get + new_batch_http_request."""

    def __init__(self, responses: dict, log: BatchLog, listing: dict | None = None):
        self._responses = responses
        self._log = log
        self._listing = listing
        self.list_calls = 0

    def new_batch_http_request(self, callback=None):
        return FakeBatch(callback, self._log)

    def users(self):
        return self

    def messages(self):
        return self

    def list(self, userId=None, labelIds=None, maxResults=None, pageToken=None):
        self.list_calls += 1
        self.last_list = {"labelIds": labelIds, "pageToken": pageToken}
        return _Executable(self._listing)

    def get(self, userId=None, id=None, format=None, metadataHeaders=None):
        assert userId == "me"
        assert format == "metadata", "목록에는 메타데이터만 필요하다"
        assert metadataHeaders == gs._METADATA_HEADERS
        self._log.requested.append(id)
        return self._responses[id]


class _Executable:
    def __init__(self, payload):
        self._payload = payload

    def execute(self):
        return self._payload


def test_single_batch_preserves_order():
    ids = [f"m{i}" for i in range(20)]
    log = BatchLog()
    service = FakeGmail({i: _message(i, f"제목 {i}") for i in ids}, log)

    out = gs._summaries_for_ids(service, ids)

    assert [m["id"] for m in out] == ids, "메일 순서가 뒤바뀌면 안 된다"
    assert log.http_calls == 1, f"배치 1회여야 하는데 {log.http_calls}회"
    assert log.sizes == [20]
    assert out[0]["subject"] == "제목 m0"
    assert out[0]["unread"] is True


def test_one_bad_message_is_skipped():
    ids = ["a", "b", "c"]
    log = BatchLog()
    service = FakeGmail(
        {"a": _message("a"), "b": _http_error(), "c": _message("c")}, log
    )

    out = gs._summaries_for_ids(service, ids)

    assert [m["id"] for m in out] == ["a", "c"], "한 통이 실패해도 나머지는 보여야 한다"


def test_all_failing_raises():
    ids = ["a", "b"]
    log = BatchLog()
    service = FakeGmail({i: _http_error() for i in ids}, log)

    with pytest.raises(HttpError):
        gs._summaries_for_ids(service, ids)


def test_chunks_above_batch_size():
    ids = [f"m{i}" for i in range(120)]
    log = BatchLog()
    service = FakeGmail({i: _message(i) for i in ids}, log)

    out = gs._summaries_for_ids(service, ids)

    assert len(out) == 120
    assert log.sizes == [50, 50, 20], "Gmail 배치 상한을 넘지 않게 쪼개야 한다"


def test_empty_list_makes_no_request():
    log = BatchLog()
    assert gs._summaries_for_ids(FakeGmail({}, log), []) == []
    assert log.batches == 0, "빈 배치를 열면 안 된다"


def test_list_messages_uses_two_round_trips(monkeypatch):
    """한 페이지(20통)에 목록 1회 + 배치 1회 = 2회. 예전에는 21회였다."""
    ids = [f"m{i}" for i in range(20)]
    log = BatchLog()
    service = FakeGmail(
        {i: _message(i, f"제목 {i}") for i in ids},
        log,
        listing={"messages": [{"id": i} for i in ids], "nextPageToken": "NEXT"},
    )
    monkeypatch.setattr(gs, "_service", lambda user, db: service)

    out = gs.list_messages(user=None, db=None, folder="sent", page_token="PT")

    assert service.list_calls + log.http_calls == 2
    assert service.last_list == {"labelIds": ["SENT"], "pageToken": "PT"}
    assert out["next_page_token"] == "NEXT"
    assert [m["id"] for m in out["messages"]] == ids
    assert out["messages"][3]["subject"] == "제목 m3"
