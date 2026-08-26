"""AI 제안 / AI 채점 응답 파싱.

GCS Pulse의 organize·feedback은 JSON으로도, SSE 스트림으로도 답할 수 있다
(엔드포인트에 `stream` 파라미터가 있다). 예전에는 `resp.json()`만 시도해서
스트림 응답이면 본문을 잃었고, 빈 결과가 그대로 UI의 빈 "AI 제안" 패널이 됐다.
"""
from types import SimpleNamespace

import httpx
import pytest

from app.core.security import encrypt_secret
from app.services import gcs_pulse_client as gcs


def _response(text: str, content_type: str) -> httpx.Response:
    return httpx.Response(200, text=text, headers={"content-type": content_type})


class FakeClient:
    """공유 커넥션 풀(`_pooled_client()`) 자리."""

    def __init__(self, response: httpx.Response | Exception):
        self._response = response
        self.calls: list[tuple[str, str, dict]] = []

    def request(self, method, url, **kwargs):
        self.calls.append((method, url, kwargs))
        if isinstance(self._response, Exception):
            raise self._response
        return self._response


@pytest.fixture
def pulse_user():
    """GCS Pulse 토큰이 등록된 사용자."""
    return SimpleNamespace(gcs_pulse_api_token_encrypted=encrypt_secret("test-token"))


@pytest.fixture
def fake_pulse(monkeypatch):
    def _install(response):
        client = FakeClient(response)
        monkeypatch.setattr(gcs, "_pooled_client", lambda: client)
        return client

    return _install


# ---- 커넥션 풀 --------------------------------------------------------------


def test_connections_are_pooled_across_calls():
    """호출마다 클라이언트를 새로 만들면 매번 TLS 핸드셰이크를 다시 한다."""
    gcs.close_client()
    try:
        first = gcs._pooled_client()
        assert gcs._pooled_client() is first, "커넥션 풀을 재사용해야 한다"
    finally:
        gcs.close_client()


def test_close_client_releases_the_pool():
    gcs._pooled_client()
    gcs.close_client()
    assert gcs._pool is None


def test_credentials_go_per_request_not_on_the_shared_client(fake_pulse, pulse_user):
    """풀은 사용자 간에 공유되므로 토큰이 클라이언트에 붙으면 안 된다."""
    client = fake_pulse(_response('{"date": "2026-08-26", "feedback": "ok"}', "application/json"))

    gcs.generate_daily_snippet_feedback(pulse_user)

    _, _, kwargs = client.calls[0]
    assert kwargs["headers"] == {"Authorization": "Bearer test-token"}


def test_missing_token_fails_before_any_request(fake_pulse):
    client = fake_pulse(_response("{}", "application/json"))
    tokenless = SimpleNamespace(gcs_pulse_api_token_encrypted=None)

    with pytest.raises(gcs.GcsPulseError) as excinfo:
        gcs.get_token_usage(tokenless)

    assert excinfo.value.status_code == 400
    assert client.calls == [], "토큰이 없으면 요청을 보내지 않아야 한다"


def test_ai_calls_get_a_longer_timeout(fake_pulse, pulse_user):
    client = fake_pulse(
        _response('{"date": "2026-08-26", "organized_content": "정리본"}', "application/json")
    )

    gcs.organize_daily_snippet(pulse_user, content="초안")

    assert client.calls[0][2]["timeout"] == gcs._AI_TIMEOUT


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


def test_organize_asks_for_a_non_streaming_response(fake_pulse, pulse_user):
    client = fake_pulse(
        _response('{"date": "2026-08-26", "organized_content": "정리본"}', "application/json")
    )

    result = gcs.organize_daily_snippet(pulse_user, content="초안")

    assert result == {"date": "2026-08-26", "organized_content": "정리본"}
    method, url, kwargs = client.calls[0]
    assert (method, url) == ("POST", "/daily-snippets/organize")
    assert kwargs["params"] == {"stream": "false"}
    assert kwargs["json"] == {"content": "초안"}


def test_organize_recovers_a_streamed_answer(fake_pulse, pulse_user):
    fake_pulse(_response('data: {"delta": "정리된 내용"}\n\n', "text/event-stream"))

    result = gcs.organize_daily_snippet(pulse_user, content="초안")

    assert result["organized_content"] == "정리된 내용"


def test_organize_reports_an_empty_answer_instead_of_returning_blank(fake_pulse, pulse_user):
    """빈 문자열을 그냥 돌려주면 UI에 빈 제안 패널이 그려진다."""
    fake_pulse(_response('{"date": "2026-08-26", "organized_content": "   "}', "application/json"))

    with pytest.raises(gcs.GcsPulseError) as excinfo:
        gcs.organize_daily_snippet(pulse_user, content="초안")

    assert excinfo.value.status_code == 502
    assert "받지 못했습니다" in excinfo.value.detail


def test_timeout_becomes_a_readable_error(fake_pulse, pulse_user):
    """처리 안 된 httpx 예외는 500이 되고, 브라우저에는 CORS 오류로 보인다."""
    fake_pulse(httpx.ReadTimeout("too slow"))

    with pytest.raises(gcs.GcsPulseError) as excinfo:
        gcs.organize_daily_snippet(pulse_user, content="초안")

    assert excinfo.value.status_code == 504


def test_connection_failure_becomes_a_readable_error(fake_pulse, pulse_user):
    fake_pulse(httpx.ConnectError("no route"))

    with pytest.raises(gcs.GcsPulseError) as excinfo:
        gcs.organize_daily_snippet(pulse_user, content="초안")

    assert excinfo.value.status_code == 502


def test_upstream_error_detail_is_unwrapped(fake_pulse, pulse_user):
    fake_pulse(httpx.Response(400, json={"detail": "토큰이 만료되었습니다"}))

    with pytest.raises(gcs.GcsPulseError) as excinfo:
        gcs.organize_daily_snippet(pulse_user, content="초안")

    assert excinfo.value.status_code == 400
    assert excinfo.value.detail == "토큰이 만료되었습니다"


# ---- feedback --------------------------------------------------------------


def test_feedback_returns_the_raw_grading_payload(fake_pulse, pulse_user):
    graded = '{"date": "2026-08-26", "feedback": "{\\"total_score\\": 86}"}'
    client = fake_pulse(_response(graded, "application/json"))

    result = gcs.generate_daily_snippet_feedback(pulse_user)

    assert result == {"date": "2026-08-26", "feedback": '{"total_score": 86}'}
    method, url, kwargs = client.calls[0]
    assert (method, url) == ("GET", "/daily-snippets/feedback")
    assert kwargs["params"] == {"stream": "false"}


def test_feedback_reports_an_empty_answer(fake_pulse, pulse_user):
    fake_pulse(_response('{"date": "2026-08-26", "feedback": null}', "application/json"))

    with pytest.raises(gcs.GcsPulseError) as excinfo:
        gcs.generate_daily_snippet_feedback(pulse_user)

    assert excinfo.value.status_code == 502
