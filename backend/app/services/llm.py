"""Claude 호출을 감싸는 얇은 레이어.

DayFit의 AI 기능(스니펫 정리·채점)은 원래 GCS Pulse를 경유한다. 상류가 흔들리면
그대로 먹통이 되므로, Pulse가 실패했을 때 자체적으로 Claude를 호출해 결과를
만들어내는 폴백 경로를 둔다.

API 키는 앱 공용(`ANTHROPIC_API_KEY`)이다. 키가 없으면 `is_configured()`가 False를
돌려주고, 폴백은 조용히 비활성화된다(= 지금까지와 동일하게 Pulse 오류가 그대로
사용자에게 전달된다).
"""
import json
import logging
import re
from threading import Lock

import anthropic

from app.core.config import settings

logger = logging.getLogger(__name__)

# 스니펫 정리·채점은 짧은 글 한 편을 다루는 작업이라 출력이 길지 않다. 넉넉히
# 잡되, 스트리밍 없이도 타임아웃에 걸리지 않는 범위로 둔다.
_MAX_TOKENS = 8000

_client: anthropic.Anthropic | None = None
_client_lock = Lock()


class LlmError(Exception):
    """Claude 호출이 실패했을 때. 폴백 경로에서만 쓰이므로 호출부가 삼킨다."""


def is_configured() -> bool:
    return bool(settings.anthropic_api_key)


def _get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        with _client_lock:
            if _client is None:
                _client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    return _client


def close_client() -> None:
    """앱 종료 시 커넥션 정리."""
    global _client
    with _client_lock:
        if _client is not None:
            _client.close()
            _client = None


def _complete(system: str, user_content: str) -> str:
    """한 번의 요청으로 텍스트 응답을 받는다."""
    if not is_configured():
        raise LlmError("ANTHROPIC_API_KEY가 설정되어 있지 않습니다")

    try:
        response = _get_client().messages.create(
            model=settings.anthropic_model,
            max_tokens=_MAX_TOKENS,
            thinking={"type": "adaptive"},
            system=system,
            messages=[{"role": "user", "content": user_content}],
        )
    except anthropic.APIStatusError as exc:
        raise LlmError(f"Claude 오류 ({exc.status_code})") from exc
    except anthropic.APIConnectionError as exc:
        raise LlmError("Claude에 연결하지 못했습니다") from exc

    # 안전 거절은 예외가 아니라 200 + stop_reason으로 온다.
    if response.stop_reason == "refusal":
        raise LlmError("Claude가 요청을 거절했습니다")

    text = "".join(block.text for block in response.content if block.type == "text").strip()
    if not text:
        raise LlmError("Claude가 빈 응답을 돌려주었습니다")
    return text


_ORGANIZE_SYSTEM = """너는 개발팀의 데일리 스니펫(일일 업무 기록)을 다듬는 편집자다.

규칙:
- 사용자가 쓴 초안의 사실을 바꾸거나 없는 내용을 지어내지 마라. 정리와 표현 다듬기만 한다.
- 초안의 마크다운 구조(제목, 항목)를 최대한 유지한다.
- 한국어로, 간결한 개조식으로 쓴다.
- 정리된 스니펫 본문만 출력한다. 설명이나 머리말을 붙이지 마라."""

_FEEDBACK_SYSTEM = """너는 개발팀의 데일리 스니펫(일일 업무 기록)을 채점하는 리뷰어다.

아래 네 항목을 각각 25점 만점으로 채점하고, 합계를 total_score(0~100)로 낸다.
- specificity: 무엇을 했는지 구체적인가 (모호한 표현이 아닌가)
- progress: 진척과 결과가 드러나는가
- blockers: 막힌 지점과 도움이 필요한 부분이 적혔는가
- next_steps: 다음 할 일이 분명한가

JSON 객체 하나만 출력한다. 코드펜스나 설명을 붙이지 마라. 형식:
{"total_score": <0-100 정수>, "scores": {"specificity": <0-25>, "progress": <0-25>, "blockers": <0-25>, "next_steps": <0-25>}, "comment": "<한국어 두세 문장 총평>"}"""

_JSON_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)


def organize_snippet(content: str) -> str:
    """AI 제안 폴백: 초안을 정리한 본문을 돌려준다."""
    return _complete(_ORGANIZE_SYSTEM, f"다음 스니펫 초안을 정리해줘:\n\n{content}")


def grade_snippet(content: str) -> str:
    """AI 채점 폴백: GCS Pulse와 같은 모양의 JSON 문자열을 돌려준다.

    `snippet_parser.extract_ai_score`가 `{"total_score": ...}`를 읽으므로, 그
    형태를 유지해야 점수가 UI에 그대로 표시된다.
    """
    raw = _complete(_FEEDBACK_SYSTEM, f"다음 스니펫을 채점해줘:\n\n{content}")
    # 모델이 코드펜스를 붙이는 경우를 대비해 벗겨낸다.
    cleaned = _JSON_FENCE.sub("", raw).strip()

    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise LlmError("Claude 채점 결과를 해석하지 못했습니다") from exc
    if not isinstance(parsed, dict) or not isinstance(parsed.get("total_score"), (int, float)):
        raise LlmError("Claude 채점 결과에 점수가 없습니다")

    # 파서가 다시 읽을 수 있도록 JSON 문자열 그대로 돌려준다.
    return json.dumps(parsed, ensure_ascii=False)
