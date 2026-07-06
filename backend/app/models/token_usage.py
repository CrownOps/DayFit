from datetime import date, datetime

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class TokenUsageLog(Base):
    __tablename__ = "token_usage_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)

    date: Mapped[date] = mapped_column(Date, index=True)
    model: Mapped[str] = mapped_column(String(64))
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    estimated_cost_usd: Mapped[float] = mapped_column(Float, default=0.0)

    source: Mapped[str] = mapped_column(String(32))  # gcs_pulse|manual|ccusage

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
