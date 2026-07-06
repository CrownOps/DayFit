from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_admin, get_current_user
from app.core.security import (
    create_access_token,
    generate_invite_code,
    hash_password,
    verify_password,
)
from app.models.user import InviteCode, User
from app.schemas.auth import (
    InviteCodeCreate,
    InviteCodeOut,
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserOut,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/invite-codes", response_model=InviteCodeOut)
def create_invite_code(
    payload: InviteCodeCreate,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    expires_at = None
    if payload.expires_in_days:
        expires_at = datetime.now(timezone.utc) + timedelta(days=payload.expires_in_days)

    invite = InviteCode(
        code=generate_invite_code(),
        created_by_id=admin.id,
        team_id=admin.team_id or settings.gcs_pulse_team_id,
        expires_at=expires_at,
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)
    return invite


@router.get("/invite-codes", response_model=list[InviteCodeOut])
def list_invite_codes(
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    return db.query(InviteCode).order_by(InviteCode.created_at.desc()).all()


@router.delete("/invite-codes/{invite_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_invite_code(
    invite_id: int,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    invite = db.get(InviteCode, invite_id)
    if invite is None:
        raise HTTPException(status_code=404, detail="Invite code not found")
    db.delete(invite)
    db.commit()


@router.post("/register", response_model=TokenResponse)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    invite = db.query(InviteCode).filter(InviteCode.code == payload.invite_code).first()
    if invite is None:
        raise HTTPException(status_code=400, detail="Invalid invite code")
    if invite.used_by_user_id is not None:
        raise HTTPException(status_code=400, detail="Invite code already used")
    if invite.expires_at is not None and invite.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Invite code expired")

    existing = db.query(User).filter(User.email == payload.email).first()
    if existing is not None:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=payload.email,
        name=payload.name,
        password_hash=hash_password(payload.password),
        is_admin=False,
        team_id=invite.team_id,
        invited_by_code_id=invite.id,
    )
    db.add(user)
    db.flush()

    invite.used_by_user_id = user.id
    invite.used_at = datetime.now(timezone.utc)

    db.commit()

    token = create_access_token(subject=user.email)
    return TokenResponse(access_token=token)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    token = create_access_token(subject=user.email)
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserOut)
def read_me(user: User = Depends(get_current_user)):
    return user
