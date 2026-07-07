from datetime import datetime

from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class IntegrationSettings(Base):
    """App-wide integration credentials (single row, ``id == 1``).

    Currently holds the shared Google OAuth client used for Calendar sync so an
    admin can configure it from the app instead of environment variables. Each
    user still runs their own OAuth consent to connect their personal calendar.
    The client secret is Fernet-encrypted at rest.
    """

    __tablename__ = "integration_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    google_client_id: Mapped[str | None] = mapped_column(String, nullable=True)
    google_client_secret_encrypted: Mapped[str | None] = mapped_column(String, nullable=True)
    google_redirect_uri: Mapped[str | None] = mapped_column(String, nullable=True)

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
