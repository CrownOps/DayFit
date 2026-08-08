from datetime import datetime

from pydantic import BaseModel, EmailStr


class InviteCodeCreate(BaseModel):
    expires_in_days: int | None = 7


class InviteCodeOut(BaseModel):
    id: int
    code: str
    team_id: str
    used_by_user_id: int | None
    used_at: datetime | None
    expires_at: datetime | None
    created_at: datetime

    class Config:
        from_attributes = True


class RegisterRequest(BaseModel):
    invite_code: str
    email: EmailStr
    name: str
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: int
    email: str
    name: str
    is_admin: bool
    team_id: str
    google_calendar_connected: bool
    gmail_connected: bool

    class Config:
        from_attributes = True
