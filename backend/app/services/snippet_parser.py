import re

# Matches CrownOps team convention, e.g. "#### 헬스 체크 (10점)\n\n- 7/10"
_CONDITION_PATTERN = re.compile(r"헬스\s*체크[^\n]*\n+[-*\s]*(\d{1,2})\s*/\s*10")


def extract_condition_score(content: str) -> int | None:
    match = _CONDITION_PATTERN.search(content)
    if not match:
        return None
    score = int(match.group(1))
    return score if 0 <= score <= 10 else None
