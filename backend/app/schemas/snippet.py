from datetime import date, datetime

from pydantic import BaseModel


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
