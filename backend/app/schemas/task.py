from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

Scope = Literal["today", "week"]


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    scope: Scope = "today"


class TaskUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=500)
    completed: Optional[bool] = None


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    scope: Scope
    anchor_date: date
    completed: bool
    sort_order: int
