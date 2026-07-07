from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_admin, get_current_user
from app.core.security import encrypt_secret
from app.models.integration import IntegrationSettings
from app.models.user import User
from app.services import google_calendar as gcal

router = APIRouter(prefix="/api/integrations", tags=["integrations"])


class GoogleIntegrationIn(BaseModel):
    client_id: str
    # Omit / leave empty to keep the stored secret unchanged.
    client_secret: str | None = None
    # Omit to fall back to the request-derived callback URL.
    redirect_uri: str | None = None


class GoogleIntegrationOut(BaseModel):
    configured: bool
    client_id: str | None
    redirect_uri: str | None
    suggested_callback_url: str


def _callback_url(request: Request) -> str:
    # Route name lives on the calendar router; url_for resolves it app-wide.
    return str(request.url_for("oauth_callback"))


def _to_out(request: Request, db: Session) -> GoogleIntegrationOut:
    row = gcal.get_settings_row(db)
    config = gcal.resolve_google_config(db, _callback_url(request))
    return GoogleIntegrationOut(
        configured=config is not None and bool(config.redirect_uri),
        client_id=(row.google_client_id if row else None),
        redirect_uri=(row.google_redirect_uri if row and row.google_redirect_uri else None),
        suggested_callback_url=_callback_url(request),
    )


@router.get("/google", response_model=GoogleIntegrationOut)
def get_google(request: Request, _: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    return _to_out(request, db)


@router.put("/google", response_model=GoogleIntegrationOut)
def set_google(
    payload: GoogleIntegrationIn,
    request: Request,
    _: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    row = gcal.get_settings_row(db)
    if row is None:
        row = IntegrationSettings(id=1)
        db.add(row)

    row.google_client_id = payload.client_id.strip()
    if payload.client_secret and payload.client_secret.strip():
        row.google_client_secret_encrypted = encrypt_secret(payload.client_secret.strip())
    if payload.redirect_uri is not None:
        row.google_redirect_uri = payload.redirect_uri.strip() or None

    db.commit()
    return _to_out(request, db)


@router.get("/google/status")
def google_status(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Whether the current user can start the Connect flow (own client, or a
    team-wide/env fallback)."""
    config = gcal.resolve_google_config(db, user, _callback_url(request))
    return {"configured": config is not None and bool(config.redirect_uri)}


# ---- Per-user Google client (each member enters their own Client ID/Secret) ----


class MyGoogleIn(BaseModel):
    client_id: str
    # Omit / leave empty to keep the stored secret unchanged.
    client_secret: str | None = None


class MyGoogleOut(BaseModel):
    configured: bool
    client_id: str | None
    has_secret: bool
    suggested_callback_url: str


def _my_out(request: Request, user: User, db: Session) -> MyGoogleOut:
    config = gcal.resolve_google_config(db, user, _callback_url(request))
    return MyGoogleOut(
        configured=config is not None and bool(config.redirect_uri),
        client_id=user.google_client_id,
        has_secret=bool(user.google_client_secret_encrypted),
        suggested_callback_url=_callback_url(request),
    )


@router.get("/google/me", response_model=MyGoogleOut)
def get_my_google(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _my_out(request, user, db)


@router.put("/google/me", response_model=MyGoogleOut)
def set_my_google(
    payload: MyGoogleIn,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user.google_client_id = payload.client_id.strip() or None
    if payload.client_secret and payload.client_secret.strip():
        user.google_client_secret_encrypted = encrypt_secret(payload.client_secret.strip())
    db.commit()
    db.refresh(user)
    return _my_out(request, user, db)
