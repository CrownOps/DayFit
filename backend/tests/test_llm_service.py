"""Claude 호출 자체 — 요청 형태와 응답 처리.

실제 API를 치지 않고 SDK에 목 트랜스포트를 물려서, 우리가 보내는 요청이
올바른 모양인지와 응답을 제대로 읽는지를 확인한다.

anthropic SDK는 httpx가 아니라 httpx2를 쓴다(`httpx2<3,>=2.0.0`). 다른 곳(GCS
Pulse)에서 쓰는 httpx의 MockTransport를 물리면 스트림 타입이 맞지 않아 연결
오류로 떨어지므로, 여기서는 httpx2를 써야 한다.
"""
import json

import anthropic
import httpx2
import pytest

from app.services import llm


def _message(text: str, *, stop_reason: str = "end_turn") -> dict:
    return {
        "id": "msg_test",
        "type": "message",
        "role": "assistant",
        "model": "claude-opus-5",
        "content": [{"type": "text", "text": text}],
        "stop_reason": stop_reason,
        "stop_sequence": None,
        "usage": {"input_tokens": 10, "output_tokens": 20},
    }


@pytest.fixture
def claude(monkeypatch):
    """목 트랜스포트를 단 Claude 클라이언트를 설치하고, 보낸 요청을 기록한다."""
    sent: list[dict] = []
    state = {"response": _message("정리본")}

    def handler(request: httpx2.Request) -> httpx2.Response:
        sent.append(json.loads(request.content))
        payload = state["response"]
        if isinstance(payload, int):  # 상태 코드 = 오류 응답
            return httpx2.Response(payload, json={"error": {"message": "nope"}})
        return httpx2.Response(200, json=payload)

    client = anthropic.Anthropic(
        api_key="test-key",
        max_retries=0,
        http_client=anthropic.DefaultHttpxClient(transport=httpx2.MockTransport(handler)),
    )
    monkeypatch.setattr(llm, "_get_client", lambda: client)
    monkeypatch.setattr(llm, "is_configured", lambda: True)

    state["sent"] = sent
    return state


def test_is_configured_follows_the_api_key(monkeypatch):
    monkeypatch.setattr(llm.settings, "anthropic_api_key", "")
    assert llm.is_configured() is False
    monkeypatch.setattr(llm.settings, "anthropic_api_key", "sk-ant-...")
    assert llm.is_configured() is True


def test_organize_sends_a_well_formed_request(claude):
    result = llm.organize_snippet("#### 오늘 한 일\n- 배치 적용")

    assert result == "정리본"
    request = claude["sent"][0]
    assert request["model"] == "claude-opus-5"
    assert request["thinking"] == {"type": "adaptive"}
    assert request["max_tokens"] == llm._MAX_TOKENS
    assert "편집자" in request["system"], "정리용 시스템 프롬프트가 붙어야 한다"
    assert request["messages"][0]["role"] == "user"
    assert "배치 적용" in request["messages"][0]["content"]


def test_refusal_is_not_treated_as_an_answer(claude):
    """안전 거절은 예외가 아니라 200 + stop_reason으로 온다."""
    claude["response"] = _message("", stop_reason="refusal")

    with pytest.raises(llm.LlmError):
        llm.organize_snippet("초안")


def test_empty_response_is_an_error(claude):
    claude["response"] = _message("   ")

    with pytest.raises(llm.LlmError):
        llm.organize_snippet("초안")


def test_api_errors_become_llm_errors(claude):
    claude["response"] = 500

    with pytest.raises(llm.LlmError):
        llm.organize_snippet("초안")


def test_unconfigured_key_raises_before_calling(monkeypatch):
    monkeypatch.setattr(llm, "is_configured", lambda: False)

    with pytest.raises(llm.LlmError):
        llm.organize_snippet("초안")


# ---- 채점 -------------------------------------------------------------------


def test_grade_returns_json_the_existing_parser_can_read(claude):
    from app.services.snippet_parser import extract_ai_score

    claude["response"] = _message(
        '{"total_score": 74, "scores": {"specificity": 20}, "comment": "구체적입니다."}'
    )

    graded = llm.grade_snippet("초안")

    assert extract_ai_score(graded) == 74, "기존 파서가 그대로 점수를 읽어야 한다"
    assert json.loads(graded)["comment"] == "구체적입니다."


def test_grade_strips_a_code_fence(claude):
    """모델이 ```json 펜스를 붙여도 점수를 잃지 않아야 한다."""
    claude["response"] = _message('```json\n{"total_score": 55}\n```')

    assert json.loads(llm.grade_snippet("초안"))["total_score"] == 55


def test_grade_rejects_unparseable_output(claude):
    claude["response"] = _message("점수를 매기기 어렵습니다.")

    with pytest.raises(llm.LlmError):
        llm.grade_snippet("초안")


def test_grade_rejects_json_without_a_score(claude):
    claude["response"] = _message('{"comment": "좋아요"}')

    with pytest.raises(llm.LlmError):
        llm.grade_snippet("초안")
