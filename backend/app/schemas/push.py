from pydantic import BaseModel


class PushSubscriptionKeys(BaseModel):
    p256dh: str
    auth: str


class PushSubscriptionCreate(BaseModel):
    endpoint: str
    keys: PushSubscriptionKeys
    device_label: str | None = None


class PushSubscriptionOut(BaseModel):
    id: int
    endpoint: str
    device_label: str | None

    class Config:
        from_attributes = True


class VapidPublicKeyOut(BaseModel):
    public_key: str
