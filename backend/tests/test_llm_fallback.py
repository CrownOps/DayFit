"""GCS Pulse가 실패하면 자체 Claude 호출로 넘어가는 경로.

폴백의 핵심 성질은 두 가지다: Pulse가 정상일 때는 Claude를 절대 부르지 않는다,
그리고 폴백이 실패하면 원래 Pulse 오류가 그대로 사용자에게 간다(폴백 오류로
바꿔치지 않는다).
"""
import json

import pytest

from app.api import snippets as snippets_api
from app.services.gcs_pulse_client import GcsPulseError
from app.services.llm import LlmError

DRAFT = "#### 오늘 한 일\n- 배치 요청으로 왕복 줄임"
GRADED = json.dumps({"total_score": 86, "scores": {"specificity": 22}}, ensure_ascii=False)


@pytest.fixture
def member(make_user, login):
    return login(make_user())


@pytest.fixture
def ai(monkeypatch):
    """Pulse와 Claude 양쪽을 스텁으로 세우고 호출 횟수를 센다."""
    state = {
        "pulse_organize": {"date": "2026-08-26", "organized_content": "Pulse 정리본"},
        "pulse_feedback": {"date": "2026-08-26", "feedback": GRADED},
        "claude_organize": "Claude 정리본",
        "claude_grade": GRADED,
        "configured": True,
        "calls": [],
    }

    def _maybe_raise(value):
        if isinstance(value, Exception):
            raise value
        return value

    monkeypatch.setattr(
        snippets_api.gcs,
        "organize_daily_snippet",
        lambda user, content: (
            state["calls"].append("pulse_organize"),
            _maybe_raise(state["pulse_organize"]),
        )[1],
    )
    monkeypatch.setattr(
        snippets_api.gcs,
        "generate_daily_snippet_feedback",
        lambda user: (
            state["calls"].append("pulse_feedback"),
            _maybe_raise(state["pulse_feedback"]),
        )[1],
    )
    monkeypatch.setattr(snippets_api.llm, "is_configured", lambda: state["configured"])
    monkeypatch.setattr(
        snippets_api.llm,
        "organize_snippet",
        lambda content: (
            state["calls"].append("claude_organize"),
            _maybe_raise(state["claude_organize"]),
        )[1],
    )
    monkeypatch.setattr(
        snippets_api.llm,
        "grade_snippet",
        lambda content: (
            state["calls"].append("claude_grade"),
            _maybe_raise(state["claude_grade"]),
        )[1],
    )
    return state


# ---- AI 제안 ---------------------------------------------------------------


def test_pulse_success_never_calls_claude(client, ai, member):
    response = client.post("/api/snippets/organize", json={"content": DRAFT})

    assert response.status_code == 200
    body = response.json()
    assert body["organized_content"] == "Pulse 정리본"
    assert body["source"] == "gcs_pulse"
    assert ai["calls"] == ["pulse_organize"], "Pulse가 답했으면 Claude를 부르면 안 된다"


def test_falls_back_to_claude_when_pulse_fails(client, ai, member):
    ai["pulse_organize"] = GcsPulseError(502, "GCS Pulse에 연결하지 못했습니다")

    response = client.post("/api/snippets/organize", json={"content": DRAFT})

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["organized_content"] == "Claude 정리본"
    assert body["source"] == "claude", "어느 엔진이 답했는지 알려줘야 한다"
    assert ai["calls"] == ["pulse_organize", "claude_organize"]


def test_falls_back_when_pulse_returns_nothing(client, ai, member):
    """빈 응답도 GcsPulseError로 올라온다(502)."""
    ai["pulse_organize"] = GcsPulseError(502, "AI가 정리한 내용을 받지 못했습니다")

    body = client.post("/api/snippets/organize", json={"content": DRAFT}).json()

    assert body["source"] == "claude"


def test_without_an_api_key_the_pulse_error_surfaces(client, ai, member):
    ai["configured"] = False
    ai["pulse_organize"] = GcsPulseError(400, "GCS Pulse API 토큰이 등록되어 있지 않습니다")

    response = client.post("/api/snippets/organize", json={"content": DRAFT})

    assert response.status_code == 400
    assert response.json()["detail"] == "GCS Pulse API 토큰이 등록되어 있지 않습니다"
    assert ai["calls"] == ["pulse_organize"], "키가 없으면 Claude를 부르지 않는다"


def test_a_failing_fallback_does_not_mask_the_real_error(client, ai, member):
    """폴백까지 실패하면 사용자가 봐야 할 건 원래 Pulse 오류다."""
    ai["pulse_organize"] = GcsPulseError(504, "GCS Pulse 응답이 너무 오래 걸려 요청이 취소되었습니다")
    ai["claude_organize"] = LlmError("Claude가 빈 응답을 돌려주었습니다")

    response = client.post("/api/snippets/organize", json={"content": DRAFT})

    assert response.status_code == 504
    assert "너무 오래" in response.json()["detail"]


# ---- AI 채점 ---------------------------------------------------------------


def test_feedback_prefers_pulse(client, ai, member):
    response = client.post("/api/snippets/feedback", json={"content": DRAFT})

    assert response.status_code == 200
    body = response.json()
    assert body["ai_score"] == 86
    assert body["source"] == "gcs_pulse"
    assert ai["calls"] == ["pulse_feedback"]


def test_feedback_falls_back_and_still_yields_a_score(client, ai, member):
    """폴백 결과도 기존 파서가 읽을 수 있는 형태여야 점수가 UI에 뜬다."""
    ai["pulse_feedback"] = GcsPulseError(502, "AI 채점 결과를 받지 못했습니다")

    body = client.post("/api/snippets/feedback", json={"content": DRAFT}).json()

    assert body["ai_score"] == 86
    assert body["source"] == "claude"
    assert ai["calls"] == ["pulse_feedback", "claude_grade"]


def test_feedback_fallback_failure_surfaces_the_pulse_error(client, ai, member):
    ai["pulse_feedback"] = GcsPulseError(400, "GCS Pulse API 토큰이 등록되어 있지 않습니다")
    ai["claude_grade"] = LlmError("Claude 채점 결과를 해석하지 못했습니다")

    response = client.post("/api/snippets/feedback", json={"content": DRAFT})

    assert response.status_code == 400


def test_legacy_get_feedback_has_no_fallback(client, ai, member):
    """PWA에 남은 옛 번들이 쓰는 경로 — 동작이 바뀌면 안 된다."""
    ai["pulse_feedback"] = GcsPulseError(502, "AI 채점 결과를 받지 못했습니다")

    response = client.get("/api/snippets/feedback")

    assert response.status_code == 502
    assert ai["calls"] == ["pulse_feedback"], "GET 경로는 Claude를 부르지 않는다"
