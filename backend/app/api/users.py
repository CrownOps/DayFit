from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.security import encrypt_secret
from app.models.user import User

router = APIRouter(prefix="/api/users", tags=["users"])


class GcsPulseTokenIn(BaseModel):
    api_token: str


class TeamIn(BaseModel):
    team_id: str


class OnboardingIn(BaseModel):
    team_id: str
    api_token: str


@router.put("/me/gcs-pulse-token", status_code=204)
def set_gcs_pulse_token(payload: GcsPulseTokenIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user.gcs_pulse_api_token_encrypted = encrypt_secret(payload.api_token)
    db.add(user)
    db.commit()


@router.get("/me/gcs-pulse-token/status")
def gcs_pulse_token_status(user: User = Depends(get_current_user)):
    return {"connected": bool(user.gcs_pulse_api_token_encrypted)}


@router.put("/me/team", status_code=204)
def set_team(payload: TeamIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user.team_id = payload.team_id.strip()
    db.add(user)
    db.commit()


@router.post("/me/onboarding", status_code=204)
def complete_onboarding(payload: OnboardingIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Set team code + personal GCS Pulse API token in one step (post-signup onboarding)."""
    user.team_id = payload.team_id.strip()
    user.gcs_pulse_api_token_encrypted = encrypt_secret(payload.api_token.strip())
    db.add(user)
    db.commit()


@router.get("/me/onboarding-status")
def onboarding_status(user: User = Depends(get_current_user)):
    return {
        "team_id": user.team_id,
        "gcs_connected": bool(user.gcs_pulse_api_token_encrypted),
        "completed": bool(user.gcs_pulse_api_token_encrypted and user.team_id),
    }
