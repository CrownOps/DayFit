"""Bootstrap the first admin user. Run once after migrations.

Usage:
    python scripts/seed_admin.py <password> [gcs_pulse_api_token]
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.security import encrypt_secret, hash_password
from app.models.user import User


def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/seed_admin.py <password> [gcs_pulse_api_token]")
        sys.exit(1)

    password = sys.argv[1]
    gcs_pulse_token = sys.argv[2] if len(sys.argv) > 2 else None

    email = settings.admin_invite_bootstrap_email
    if not email:
        print("ADMIN_INVITE_BOOTSTRAP_EMAIL is not set in .env")
        sys.exit(1)

    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.email == email).first()
        if existing is not None:
            print(f"Admin user already exists: {email}")
            return

        admin = User(
            email=email,
            name="Eunji",
            password_hash=hash_password(password),
            is_admin=True,
            team_id=settings.gcs_pulse_team_id,
            gcs_pulse_api_token_encrypted=encrypt_secret(gcs_pulse_token) if gcs_pulse_token else None,
        )
        db.add(admin)
        db.commit()
        print(f"Admin user created: {email}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
