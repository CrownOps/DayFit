"""AI 제안 / AI 채점 응답 파싱.

GCS Pulse의 organize·feedback은 JSON으로도, SSE 스트림으로도 답할 수 있다
(엔드포인트에 `stream` 파라미터가 있다). 예전에는 `resp.json()`만 시도해서
스트림 응답이면 본문을 잃었고, 빈 결과가 그대로 UI의 빈 "AI 제안" 패널이 됐다.
"""
import httpx
import pytest

from app.services import gcs_pulse_client as gcs


def _response(text: str, content_type: str) -> httpx.Response:
    return httpx.Response(200, text=text, headers={"content-type": content_type})


class FakeClient:
    """`_client()`가 돌려주는 httpx.Client 자리."""

    def __init__(self, response: httpx.Response | Exception):
        self._response = response
        self.calls: list[tuple[str, str, dict]] = []

    def __enter__(self):
        return self

    def __exit__(self, *exc_info):
        return False

    def request(self, method, url, **kwargs):
        self.calls.append((method, url, kwargs))
        if isinstance(self._response, Exception):
            raise self._response
        return self._response


@pytest.fixture
def fake_pulse(monkeypatch):
    def _install(response):
        client = FakeClient(response)
        monkeypatch.setattr(gcs, "_client", lambda user, timeout=15.0: client)
        return client

    return _install


# ---- 파싱 ------------------------------------------------------------------


def test_reads_a_plain_json_body():
    text, date = gcs._ai_payload(
        _response('{"date": "2026-08-26", "organized_content": "정리본"}', "application/json"),
        "organized_content",
    )
    assert text == "정리본"
    assert date == "2026-08-26"


def test_rebuilds_a_streamed_body():
    stream = 'data: {"delta": "오늘 "}\n\ndata: {"delta": "한 일"}\n\ndata: [DONE]\n\n'
    text, date = gcs._ai_payload(_response(stream, "text/event-stream"), "organized_content")
    assert text == "오늘 한 일", "SSE 청크를 이어붙여 복원해야 한다"
    assert date is None


def test_stream_of_bare_text_chunks():
    assert gcs._decode_stream_text("data: 안녕\ndata: 하세요\n") == "안녕하세요"


def test_empty_json_field_reports_nothing():
    text, _ = gcs._ai_payload(
        _response('{"date": "2026-08-26", "organized_content": ""}', "application/json"),
        "organized_content",
    )
    assert text == ""


# ---- organize --------------------------------------------------------------


def test_organize_asks_for_a_non_streaming_response(fake_pulse):
    client = fake_pulse(
        _response('{"date": "2026-08-26", "organized_content": "정리본"}', "application/json")
    )

    result = gcs.organize_daily_snippet(user=None, content="초안")

    assert result == {"date": "2026-08-26", "organized_content": "정리본"}
    method, url, kwargs = client.calls[0]
    assert (method, url) == ("POST", "/daily-snippets/organize")
    assert kwargs["params"] == {"stream": "false"}
    assert kwargs["json"] == {"content": "초안"}


def test_organize_recovers_a_streamed_answer(fake_pulse):
    fake_pulse(_response('data: {"delta": "정리된 내용"}\n\n', "text/event-stream"))

    result = gcs.organize_daily_snippet(user=None, content="초안")

    assert result["organized_content"] == "정리된 내용"


def test_organize_reports_an_empty_answer_instead_of_returning_blank(fake_pulse):
    """빈 문자열을 그냥 돌려주면 UI에 빈 제안 패널이 그려진다."""
    fake_pulse(_response('{"date": "2026-08-26", "organized_content": "   "}', "application/json"))

    with pytest.raises(gcs.GcsPulseError) as excinfo:
        gcs.organize_daily_snippet(user=None, content="초안")

    assert excinfo.value.status_code == 502
    assert "받지 못했습니다" in excinfo.value.detail


def test_timeout_becomes_a_readable_error(fake_pulse):
    """처리 안 된 httpx 예외는 500이 되고, 브라우저에는 CORS 오류로 보인다."""
    fake_pulse(httpx.ReadTimeout("too slow"))

    with pytest.raises(gcs.GcsPulseError) as excinfo:
        gcs.organize_daily_snippet(user=None, content="초안")

    assert excinfo.value.status_code == 504


def test_connection_failure_becomes_a_readable_error(fake_pulse):
    fake_pulse(httpx.ConnectError("no route"))

    with pytest.raises(gcs.GcsPulseError) as excinfo:
        gcs.organize_daily_snippet(user=None, content="초안")

    assert excinfo.value.status_code == 502


def test_upstream_error_detail_is_unwrapped(fake_pulse):
    fake_pulse(httpx.Response(400, json={"detail": "토큰이 만료되었습니다"}))

    with pytest.raises(gcs.GcsPulseError) as excinfo:
        gcs.organize_daily_snippet(user=None, content="초안")

    assert excinfo.value.status_code == 400
    assert excinfo.value.detail == "토큰이 만료되었습니다"


# ---- feedback --------------------------------------------------------------


def test_feedback_returns_the_raw_grading_payload(fake_pulse):
    graded = '{"date": "2026-08-26", "feedback": "{\\"total_score\\": 86}"}'
    client = fake_pulse(_response(graded, "application/json"))

    result = gcs.generate_daily_snippet_feedback(user=None)

    assert result == {"date": "2026-08-26", "feedback": '{"total_score": 86}'}
    method, url, kwargs = client.calls[0]
    assert (method, url) == ("GET", "/daily-snippets/feedback")
    assert kwargs["params"] == {"stream": "false"}


def test_feedback_reports_an_empty_answer(fake_pulse):
    fake_pulse(_response('{"date": "2026-08-26", "feedback": null}', "application/json"))

    with pytest.raises(gcs.GcsPulseError) as excinfo:
        gcs.generate_daily_snippet_feedback(user=None)

    assert excinfo.value.status_code == 502
