import json
import logging

from pywebpush import WebPushException, webpush
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.push import PushSubscription

logger = logging.getLogger(__name__)

VAPID_CLAIMS = {"sub": settings.vapid_subject}


def send_to_user(db: Session, user_id: int, title: str, body: str, url: str = "/") -> None:
    subs = db.query(PushSubscription).filter(PushSubscription.user_id == user_id).all()
    payload = json.dumps({"title": title, "body": body, "url": url})

    for sub in subs:
        try:
            webpush(
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {"p256dh": sub.keys_p256dh, "auth": sub.keys_auth},
                },
                data=payload,
                vapid_private_key=settings.vapid_private_key,
                vapid_claims=dict(VAPID_CLAIMS),
            )
        except WebPushException as exc:
            status_code = exc.response.status_code if exc.response is not None else None
            if status_code in (404, 410):
                db.delete(sub)
                db.commit()
            else:
                logger.warning("Push send failed for subscription %s: %s", sub.id, exc)
