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
