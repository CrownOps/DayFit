from datetime import date, datetime

from pydantic import BaseModel


class ManualTokenUsageCreate(BaseModel):
    date: date
    model: str
    input_tokens: int = 0
    output_tokens: int = 0


class TokenUsageLogOut(BaseModel):
    id: int
    user_id: int
    date: date
    model: str
    input_tokens: int
    output_tokens: int
    estimated_cost_usd: float
    source: str
    created_at: datetime

    class Config:
        from_attributes = True


class GcsPulseQuotaOut(BaseModel):
    allocated: int
    used: int
    remaining: int
    last_reset: datetime
    next_reset: datetime
