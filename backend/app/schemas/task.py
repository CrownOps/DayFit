from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

Scope = Literal["today", "week"]
TaskStatus = Literal["todo", "in_progress", "done"]
# Whether to list the caller's own tasks or the whole team's (read-only view).
TaskView = Literal["own", "team"]


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    scope: Scope = "today"
    # When set, the task is created attached to a calendar event instead
    # (scope is forced to "event" server-side, ignoring the field above).
    calendar_event_id: Optional[int] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=500)
    status: Optional[TaskStatus] = None
    # Legacy toggle; still accepted and mapped to `status`.
    completed: Optional[bool] = None
    # Move the task into "today"/"week" (recomputes anchor_date); e.g. promoting
    # a "week" task to "today" when it's referenced from the daily snippet.
    scope: Optional[Scope] = None


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
    # "team" is used for unclaimed shared-pool items; the board only ever sees today/week.
    scope: str
    anchor_date: date
    status: TaskStatus
    completed: bool
    sort_order: int
    owner: Optional[TaskOwner] = None
    # When this task was claimed from the team pool (null unless it's a claim record).
    claimed_at: Optional[datetime] = None
    # Set when the task was created from a calendar event ("일정 할일").
    calendar_event_id: Optional[int] = None


class TeamTaskCreate(BaseModel):
    """A new item for the team's shared pool ("팀 할일")."""

    title: str = Field(min_length=1, max_length=500)
