from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

BottleneckPriority = Literal["high", "medium", "low"]
BottleneckStatus = Literal["open", "in_progress", "resolved"]


class PersonRef(BaseModel):
    id: int
    name: str


# ---- Actions ----
class ActionCreate(BaseModel):
    content: str = Field(min_length=1)
    effect: str = ""
    done: bool = False


class ActionUpdate(BaseModel):
    content: Optional[str] = Field(default=None, min_length=1)
    effect: Optional[str] = None
    done: Optional[bool] = None


class ActionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    bottleneck_id: int
    content: str
    effect: str
    done: bool
    creator: Optional[PersonRef] = None
    created_at: datetime
    updated_at: datetime


# ---- Bottlenecks ----
class BottleneckCreate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    description: str = ""
    priority: BottleneckPriority = "medium"
    status: BottleneckStatus = "open"
    occurred_at: Optional[datetime] = None  # defaults to now server-side
    deadline: Optional[datetime] = None


class BottleneckUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=500)
    description: Optional[str] = None
    priority: Optional[BottleneckPriority] = None
    status: Optional[BottleneckStatus] = None
    occurred_at: Optional[datetime] = None
    deadline: Optional[datetime] = None


class BottleneckOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str
    priority: BottleneckPriority
    status: BottleneckStatus
    occurred_at: datetime
    deadline: Optional[datetime]
    creator: Optional[PersonRef] = None
    actions: list[ActionOut] = []
    created_at: datetime
    updated_at: datetime
