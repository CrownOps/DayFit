from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.push import PushSubscription
from app.models.user import User
from app.schemas.push import PushSubscriptionCreate, PushSubscriptionOut, VapidPublicKeyOut

router = APIRouter(prefix="/api/push", tags=["push"])


@router.get("/vapid-public-key", response_model=VapidPublicKeyOut)
def vapid_public_key():
    return VapidPublicKeyOut(public_key=settings.vapid_public_key)


@router.get("/subscriptions", response_model=list[PushSubscriptionOut])
def list_subscriptions(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(PushSubscription).filter(PushSubscription.user_id == user.id).all()


@router.post("/subscriptions", response_model=PushSubscriptionOut)
def create_subscription(
    payload: PushSubscriptionCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    existing = db.query(PushSubscription).filter(PushSubscription.endpoint == payload.endpoint).first()
    if existing is not None:
        existing.user_id = user.id
        existing.keys_p256dh = payload.keys.p256dh
        existing.keys_auth = payload.keys.auth
        existing.device_label = payload.device_label
        db.add(existing)
        db.commit()
        db.refresh(existing)
        return existing

    sub = PushSubscription(
        user_id=user.id,
        endpoint=payload.endpoint,
        keys_p256dh=payload.keys.p256dh,
        keys_auth=payload.keys.auth,
        device_label=payload.device_label,
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return sub


@router.delete("/subscriptions/{sub_id}", status_code=204)
def delete_subscription(sub_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    sub = db.get(PushSubscription, sub_id)
    if sub is None or sub.user_id != user.id:
        raise HTTPException(status_code=404, detail="Subscription not found")
    db.delete(sub)
    db.commit()
