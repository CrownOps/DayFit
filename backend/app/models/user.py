from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(100))
    password_hash: Mapped[str] = mapped_column(String(255))
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    team_id: Mapped[str] = mapped_column(String(64), default="")

    # Per-user Google OAuth client (each member registers their own Cloud
    # client and connects their own calendar). Secret is Fernet-encrypted.
    google_client_id: Mapped[str | None] = mapped_column(String, nullable=True)
    google_client_secret_encrypted: Mapped[str | None] = mapped_column(String, nullable=True)

    google_oauth_token_encrypted: Mapped[str | None] = mapped_column(String, nullable=True)
    google_refresh_token_encrypted: Mapped[str | None] = mapped_column(String, nullable=True)
    google_calendar_connected: Mapped[bool] = mapped_column(Boolean, default=False)

    # Gmail is connected independently from Calendar so each can point at a
    # different Google account (e.g. a personal Gmail inbox alongside a work
    # Google Calendar) — separate OAuth tokens, separate consent flow.
    gmail_oauth_token_encrypted: Mapped[str | None] = mapped_column(String, nullable=True)
    gmail_refresh_token_encrypted: Mapped[str | None] = mapped_column(String, nullable=True)
    gmail_connected: Mapped[bool] = mapped_column(Boolean, default=False)

    gcs_pulse_api_token_encrypted: Mapped[str | None] = mapped_column(String, nullable=True)

    # No FK constraint: invite_codes references users, so this is a soft back-reference
    # to avoid a circular foreign-key dependency between the two tables.
    invited_by_code_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class InviteCode(Base):
    __tablename__ = "invite_codes"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    team_id: Mapped[str] = mapped_column(String(64), default="")

    used_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
