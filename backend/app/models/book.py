from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Book(Base):
    """A book on the user's reading list.

    ``status`` tracks the reading lifecycle: "want" (읽기 전), "reading" (진행 중),
    "done" (완료). ``rating`` is a 1-5 recommendation score and ``review`` holds the
    free-form reason / thoughts — both are typically filled in once a book is finished.
    """

    __tablename__ = "books"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)

    title: Mapped[str] = mapped_column(String(500))
    author: Mapped[str] = mapped_column(String(255), default="")

    # "want" | "reading" | "done"
    status: Mapped[str] = mapped_column(String(16), default="want", index=True)

    # 추천도: 1-5 stars, null while unrated
    rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # 추천 이유 / 감상
    review: Mapped[str] = mapped_column(Text, default="")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
