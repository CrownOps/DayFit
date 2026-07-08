from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

Scope = Literal["today", "week"]
TaskStatus = Literal["todo", "in_progress", "done"]
# Whether to list the caller's own tasks or the whole team's (read-only view).
TaskView = Literal["own", "team"]


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    scope: Scope = "today"


class TaskUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=500)
    status: Optional[TaskStatus] = None
    # Legacy toggle; still accepted and mapped to `status`.
    completed: Optional[bool] = None


class TaskReorder(BaseModel):
    """New ordering for one column. Any listed task is moved into `scope`
    (recomputing its anchor date) and its position becomes its list index.
    """

    scope: Scope
    ids: list[int]


class TaskOwner(BaseModel):
    id: int
    name: str


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    scope: Scope
    anchor_date: date
    status: TaskStatus
    completed: bool
    sort_order: int
    owner: Optional[TaskOwner] = None
