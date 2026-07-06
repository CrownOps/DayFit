from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)

    endpoint: Mapped[str] = mapped_column(Text, unique=True)
    keys_p256dh: Mapped[str] = mapped_column(String(255))
    keys_auth: Mapped[str] = mapped_column(String(255))
    device_label: Mapped[str | None] = mapped_column(String(100), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class NotificationSchedule(Base):
    __tablename__ = "notification_schedule"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)

    source_type: Mapped[str] = mapped_column(String(32))  # "calendar_event" | "habit"
    source_id: Mapped[int] = mapped_column()

    fire_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="pending")  # pending|sent|failed

    title: Mapped[str] = mapped_column(String(255))
    body: Mapped[str] = mapped_column(String(500))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
