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
from pydantic import BaseModel, Field

from app.core.config import settings

logger = logging.getLogger(__name__)

# 스니펫 정리·채점은 짧은 글 한 편을 다루는 작업이라 출력이 길지 않다. 넉넉히
# 잡되, 스트리밍 없이도 타임아웃에 걸리지 않는 범위로 둔다.
_MAX_TOKENS = 8000

# 메일 본문 상한. 넘으면 조용히 잘라내지 않고 오류로 알린다 — 잘린 줄 모르고
# 요약을 믿는 쪽이 더 나쁘다. 100k 토큰 남짓에 해당한다.
_MAX_EMAIL_CHARS = 400_000

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


class EmailBrief(BaseModel):
    """메일 한 통에서 뽑아내는 것."""

    summary: str = Field(description="핵심을 담은 한국어 요약. 2~4문장.")
    action_items: list[str] = Field(
        description=(
            "이 메일을 받은 사람이 해야 할 일. 각 항목은 동사로 끝나는 짧은 한국어 문장. "
            "할 일이 없으면 빈 배열."
        )
    )


_EMAIL_SYSTEM = """너는 업무 메일을 정리해주는 비서다.

- 메일 내용에 없는 사실을 지어내지 마라.
- 요약은 받는 사람이 알아야 할 것 위주로, 인사말·서명·법적 고지는 빼라.
- 할 일은 "이 메일을 받은 사람이" 해야 하는 것만 뽑는다. 발신자가 하겠다고 한 일이나
  단순 공지는 할 일이 아니다. 마감이 있으면 문장에 함께 적는다.
- 광고·뉴스레터처럼 할 일이 없는 메일이면 action_items는 빈 배열로 둔다."""


def summarize_email(subject: str, sender: str, body: str) -> EmailBrief:
    """메일 요약 + 할 일 추출.

    구조화된 출력을 쓰므로 응답이 스키마에 맞는 것이 보장된다 — 채점 쪽처럼
    JSON을 손으로 파싱하고 코드펜스를 벗겨낼 필요가 없다.
    """
    if not is_configured():
        raise LlmError("ANTHROPIC_API_KEY가 설정되어 있지 않습니다")
    if len(body) > _MAX_EMAIL_CHARS:
        raise LlmError("메일이 너무 길어 요약할 수 없습니다")

    user_content = f"제목: {subject}\n보낸사람: {sender}\n\n본문:\n{body}"
    try:
        response = _get_client().messages.parse(
            model=settings.anthropic_model,
            max_tokens=_MAX_TOKENS,
            thinking={"type": "adaptive"},
            system=_EMAIL_SYSTEM,
            messages=[{"role": "user", "content": user_content}],
            output_format=EmailBrief,
        )
    except anthropic.APIStatusError as exc:
        raise LlmError(f"Claude 오류 ({exc.status_code})") from exc
    except anthropic.APIConnectionError as exc:
        raise LlmError("Claude에 연결하지 못했습니다") from exc

    if response.stop_reason == "refusal":
        raise LlmError("Claude가 요청을 거절했습니다")

    brief = response.parsed_output
    if brief is None:
        raise LlmError("Claude가 요약을 돌려주지 않았습니다")
    # 빈 문자열 항목은 UI에서 빈 줄로 보이므로 걸러낸다.
    brief.action_items = [item.strip() for item in brief.action_items if item.strip()]
    return brief


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
