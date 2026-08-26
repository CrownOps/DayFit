from typing import Literal

from pydantic import BaseModel

Folder = Literal["inbox", "sent"]


class EmailSummary(BaseModel):
    id: str
    thread_id: str
    subject: str
    from_: str
    snippet: str
    date: str
    unread: bool


class EmailDetail(EmailSummary):
    to_: str
    body_text: str


class EmailListOut(BaseModel):
    messages: list[EmailSummary]
    next_page_token: str | None = None


class EmailBriefOut(BaseModel):
    """AI가 메일 한 통에서 뽑아낸 요약과 할 일."""

    summary: str
    action_items: list[str]


class GmailStatusOut(BaseModel):
    """Which Google account the 이메일 page is currently reading from.

    ``configured`` is False when the user hasn't registered their own Google
    OAuth client yet, in which case connecting can't even be attempted.
    """

    connected: bool
    email: str | None = None
    configured: bool
