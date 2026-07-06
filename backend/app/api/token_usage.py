from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.token_usage import TokenUsageLog
from app.models.user import User
from app.schemas.token_usage import GcsPulseQuotaOut, ManualTokenUsageCreate, TokenUsageLogOut
from app.services import gcs_pulse_client as gcs
from app.services.gcs_pulse_client import GcsPulseError
from app.services.token_pricing import estimate_cost_usd

router = APIRouter(prefix="/api/token-usage", tags=["token-usage"])


@router.get("/gcs-pulse-quota", response_model=GcsPulseQuotaOut)
def gcs_pulse_quota(user: User = Depends(get_current_user)):
    try:
        result = gcs.get_token_usage(user)
    except GcsPulseError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)
    return GcsPulseQuotaOut(**result["short"])


@router.post("/manual", response_model=TokenUsageLogOut)
def add_manual_usage(payload: ManualTokenUsageCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    log = TokenUsageLog(
        user_id=user.id,
        date=payload.date,
        model=payload.model,
        input_tokens=payload.input_tokens,
        output_tokens=payload.output_tokens,
        estimated_cost_usd=estimate_cost_usd(payload.model, payload.input_tokens, payload.output_tokens),
        source="manual",
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


@router.get("", response_model=list[TokenUsageLogOut])
def list_usage(
    scope: str = Query("own", pattern="^(own|team)$"),
    from_date: date | None = None,
    to_date: date | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(TokenUsageLog)
    if scope == "own":
        query = query.filter(TokenUsageLog.user_id == user.id)
    else:
        team_user_ids = [u.id for u in db.query(User).filter(User.team_id == user.team_id).all()]
        query = query.filter(TokenUsageLog.user_id.in_(team_user_ids))

    if from_date:
        query = query.filter(TokenUsageLog.date >= from_date)
    if to_date:
        query = query.filter(TokenUsageLog.date <= to_date)

    return query.order_by(TokenUsageLog.date.desc()).all()


@router.delete("/manual/{log_id}", status_code=204)
def delete_manual_usage(log_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    log = db.get(TokenUsageLog, log_id)
    if log is None or log.user_id != user.id:
        raise HTTPException(status_code=404, detail="Log not found")
    db.delete(log)
    db.commit()
