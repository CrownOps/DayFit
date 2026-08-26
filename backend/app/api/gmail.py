from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.calendar import GoogleAuthUrlOut
from app.schemas.gmail import EmailDetail, EmailListOut, Folder, GmailStatusOut
from app.services import gmail_service
from app.services import google_calendar as gcal
from app.services.gmail_service import GmailError
from app.services.google_calendar import GoogleNotConfiguredError

router = APIRouter(prefix="/api/gmail", tags=["gmail"])

_NOT_CONNECTED_DETAIL = "이메일(Gmail)이 연결되어 있지 않습니다. 설정에서 이메일을 연결하세요."


def _callback_url(request: Request) -> str:
    # Reuses the single callback route registered in Google Cloud Console
    # (defined in app.api.calendar); `state` tells it this was a Gmail request.
    return str(request.url_for("oauth_callback"))


@router.get("/oauth/authorize", response_model=GoogleAuthUrlOut)
def authorize(
    request: Request,
    return_to: str | None = Query(None, description="연결 후 돌아갈 프론트엔드 경로"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        return GoogleAuthUrlOut(
            auth_url=gcal.get_authorization_url(
                db, user, _callback_url(request), purpose="gmail", return_to=return_to
            )
        )
    except GoogleNotConfiguredError:
        raise HTTPException(
            status_code=400,
            detail="Google 연동이 설정되지 않았습니다. 설정에서 본인 Google API(Client ID/Secret)를 먼저 입력하세요.",
        )


@router.get("/status", response_model=GmailStatusOut)
def status(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Connection state for the 이메일 page: which Google account is connected."""
    return GmailStatusOut(
        connected=user.gmail_connected,
        email=gmail_service.get_connected_address(user, db),
        configured=gcal.resolve_google_config(db, user) is not None,
    )


@router.delete("/connection", status_code=204)
def disconnect(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Disconnect the Gmail account (Calendar keeps its own, separate token)."""
    gcal.clear_credentials(db, user, purpose="gmail")


@router.get("/messages", response_model=EmailListOut)
def list_messages(
    folder: Folder = Query("inbox"),
    page_token: str | None = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not user.gmail_connected:
        raise HTTPException(status_code=400, detail=_NOT_CONNECTED_DETAIL)
    try:
        return gmail_service.list_messages(user, db, folder, page_token)
    except GoogleNotConfiguredError:
        raise HTTPException(status_code=400, detail=_NOT_CONNECTED_DETAIL)
    except GmailError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)


@router.get("/messages/{message_id}", response_model=EmailDetail)
def get_message(
    message_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    if not user.gmail_connected:
        raise HTTPException(status_code=400, detail=_NOT_CONNECTED_DETAIL)
    try:
        return gmail_service.get_message(user, db, message_id)
    except GoogleNotConfiguredError:
        raise HTTPException(status_code=400, detail=_NOT_CONNECTED_DETAIL)
    except GmailError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)
