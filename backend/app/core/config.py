from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    secret_key: str
    encryption_key: str
    access_token_expire_minutes: int = 10080

    admin_invite_bootstrap_email: str = ""

    database_url: str

    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = ""

    vapid_public_key: str = ""
    vapid_private_key: str = ""
    vapid_subject: str = "mailto:admin@example.com"

    gcs_pulse_base_url: str = "https://api.1000.school"
    gcs_pulse_team_id: str = ""

    cors_origins: str = "http://localhost:3000"
    frontend_url: str = "http://localhost:3000"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
