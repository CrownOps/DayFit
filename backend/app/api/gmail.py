from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.gmail import EmailDetail, EmailListOut, Folder
from app.services import gmail_service
from app.services.gmail_service import GmailError
from app.services.google_calendar import GoogleNotConfiguredError

router = APIRouter(prefix="/api/gmail", tags=["gmail"])

_NOT_CONNECTED_DETAIL = (
    "Google 계정이 연결되어 있지 않습니다. 설정에서 Google Calendar를 연결하세요."
)


@router.get("/messages", response_model=EmailListOut)
def list_messages(
    folder: Folder = Query("inbox"),
    page_token: str | None = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not user.google_calendar_connected:
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
    if not user.google_calendar_connected:
        raise HTTPException(status_code=400, detail=_NOT_CONNECTED_DETAIL)
    try:
        return gmail_service.get_message(user, db, message_id)
    except GoogleNotConfiguredError:
        raise HTTPException(status_code=400, detail=_NOT_CONNECTED_DETAIL)
    except GmailError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)
