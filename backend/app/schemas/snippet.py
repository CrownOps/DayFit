from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel

# 어느 엔진이 답했는지. Pulse가 실패하면 자체 Claude 호출로 폴백한다.
AiSource = Literal["gcs_pulse", "claude"]


class SnippetCreate(BaseModel):
    content: str


class SnippetUpdate(BaseModel):
    content: str


class SnippetAuthor(BaseModel):
    id: int
    name: str
    email: str | None = None


class SnippetOut(BaseModel):
    id: int
    user_id: int
    author: SnippetAuthor | None = None
    date: date
    content: str
    condition_score: int | None = None
    ai_score: int | None = None
    created_at: datetime
    updated_at: datetime


class SnippetOrganizeOut(BaseModel):
    """AI 제안 result: the AI-reorganized version of a draft."""

    date: date
    organized_content: str
    source: AiSource = "gcs_pulse"


class SnippetFeedbackOut(BaseModel):
    """AI 채점 result: the grading score plus the raw feedback payload."""

    date: date
    ai_score: int | None = None
    feedback: str | None = None
    source: AiSource = "gcs_pulse"


class HeatmapDay(BaseModel):
    date: date
    written: bool
    condition_score: int | None = None


class TeamHealthEntry(BaseModel):
    user_id: int
    name: str
    date: date | None
    condition_score: int | None
    has_snippet_today: bool
    content_preview: str | None = None
