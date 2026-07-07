import json
import re

# Matches CrownOps team convention, e.g. "#### 헬스 체크 (10점)\n\n- 7/10"
_CONDITION_PATTERN = re.compile(r"헬스\s*체크[^\n]*\n+[-*\s]*(\d{1,2})\s*/\s*10")


def extract_condition_score(content: str) -> int | None:
    match = _CONDITION_PATTERN.search(content)
    if not match:
        return None
    score = int(match.group(1))
    return score if 0 <= score <= 10 else None


def extract_ai_score(feedback: str | None) -> int | None:
    """Pull the AI grading score (0–100) from a snippet's `feedback` payload.

    GCS Pulse returns `feedback` as a JSON string like
    `{"total_score": 86, "scores": {...}}`. Missing/malformed feedback → None.
    """
    if not feedback:
        return None
    try:
        data = json.loads(feedback)
    except (json.JSONDecodeError, TypeError):
        return None
    score = data.get("total_score") if isinstance(data, dict) else None
    if not isinstance(score, (int, float)):
        return None
    score = int(score)
    return score if 0 <= score <= 100 else None
