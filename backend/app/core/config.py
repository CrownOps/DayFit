from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    secret_key: str
    encryption_key: str
    access_token_expire_minutes: int = 10080

    admin_invite_bootstrap_email: str = ""

    database_url: str

    @field_validator("database_url", mode="after")
    @classmethod
    def _use_psycopg_driver(cls, v: str) -> str:
        # Managed Postgres providers (Railway, Heroku, …) hand out URLs with a
        # bare `postgresql://` (or legacy `postgres://`) scheme, which SQLAlchemy
        # resolves to psycopg2. We ship psycopg 3, so force the `+psycopg` driver.
        if v.startswith("postgres://"):
            v = "postgresql://" + v[len("postgres://"):]
        if v.startswith("postgresql://"):
            v = "postgresql+psycopg://" + v[len("postgresql://"):]
        return v

    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = ""

    vapid_public_key: str = ""
    vapid_private_key: str = ""
    vapid_subject: str = "mailto:admin@example.com"

    # Claude (Anthropic). 앱 공용 키 — 비어 있으면 AI 폴백이 꺼진다.
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-opus-5"

    gcs_pulse_base_url: str = "https://api.1000.school"
    gcs_pulse_team_id: str = ""

    cors_origins: str = "http://localhost:3000"
    frontend_url: str = "http://localhost:3000"

    @property
    def cors_origin_list(self) -> list[str]:
        origins = [o.strip().rstrip("/") for o in self.cors_origins.split(",") if o.strip()]
        # The frontend URL (used for OAuth redirects) is always a trusted origin.
        # Including it means setting FRONTEND_URL alone is enough for browser API
        # calls, so CORS can't silently break when CORS_ORIGINS is unset or points
        # at a stale domain.
        frontend_origin = self.frontend_url.strip().rstrip("/")
        if frontend_origin and frontend_origin not in origins:
            origins.append(frontend_origin)
        return origins


settings = Settings()
