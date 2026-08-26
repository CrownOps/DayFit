from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Team(Base):
    """Team-wide profile keyed by ``team_id`` (the string stored on ``User.team_id``).

    Holds the shared vision / mission statements. There is one row per team; it is
    created lazily the first time an admin saves the profile.
    """

    __tablename__ = "teams"

    team_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    vision: Mapped[str] = mapped_column(Text, default="")
    mission: Mapped[str] = mapped_column(Text, default="")

    # Who may edit each section: "admin" (관리자만) or "member" (팀원 전체).
    # Admins can always edit, and can change these policies in 설정.
    rules_edit_policy: Mapped[str] = mapped_column(
        String(16), default="admin", server_default="admin"
    )
    profile_edit_policy: Mapped[str] = mapped_column(
        String(16), default="admin", server_default="admin"
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class TeamRule(Base):
    """A single shared team rule / ground rule. Ordered by ``sort_order``."""

    __tablename__ = "team_rules"

    id: Mapped[int] = mapped_column(primary_key=True)
    team_id: Mapped[str] = mapped_column(String(64), index=True)
    content: Mapped[str] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
