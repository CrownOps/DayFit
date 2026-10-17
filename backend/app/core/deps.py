from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import API_TOKEN_PREFIX, decode_access_token, hash_api_token
from app.models.api_token import ApiToken
from app.models.user import User

bearer_scheme = HTTPBearer(auto_error=False)

# Stamp last_used_at at most this often so token-authenticated reads don't
# turn into a write per request.
_LAST_USED_GRANULARITY = timedelta(hours=1)


def _user_from_api_token(token: str, db: Session) -> User:
    api_token = db.query(ApiToken).filter(ApiToken.token_hash == hash_api_token(token)).first()
    if api_token is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or revoked API token")

    now = datetime.now(timezone.utc)
    last_used = api_token.last_used_at
    if last_used is not None and last_used.tzinfo is None:  # SQLite drops tzinfo
        last_used = last_used.replace(tzinfo=timezone.utc)
    if last_used is None or now - last_used > _LAST_USED_GRANULARITY:
        api_token.last_used_at = now
        db.commit()

    user = db.get(User, api_token.user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    if credentials.credentials.startswith(API_TOKEN_PREFIX):
        return _user_from_api_token(credentials.credentials, db)

    email = decode_access_token(credentials.credentials)
    if email is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    user = db.query(User).filter(User.email == email).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    return user


def get_current_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin privileges required")
    return user
