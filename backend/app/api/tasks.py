from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.task import Task
from app.models.user import User
from app.schemas.task import Scope, TaskCreate, TaskOut, TaskOwner, TaskReorder, TaskUpdate, TaskView

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


def _anchor_for(scope: str) -> date:
    today = date.today()
    if scope == "week":
        return today - timedelta(days=(today.weekday()))  # Monday of this week
    return today


def _get_owned(db: Session, task_id: int, user: User) -> Task:
    task = db.get(Task, task_id)
    if task is None or task.user_id != user.id:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


def _to_out(task: Task, owner_id: int, owner_name: str) -> TaskOut:
    out = TaskOut.model_validate(task)
    out.owner = TaskOwner(id=owner_id, name=owner_name)
    return out


@router.get("", response_model=list[TaskOut])
def list_tasks(
    scope: Scope = Query("today"),
    view: TaskView = Query("own"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Tasks for the current day (scope=today) or current week (scope=week).

    view=own  -> the current user's tasks.
    view=team -> every teammate's tasks for the same period, each with its owner
                 (read-only view for sharing progress).
    """
    anchor = _anchor_for(scope)
    query = db.query(Task, User.id, User.name).join(User, Task.user_id == User.id)
    query = query.filter(Task.scope == scope, Task.anchor_date == anchor)
    if view == "team":
        if not user.team_id:
            return []
        query = query.filter(User.team_id == user.team_id)
    else:
        query = query.filter(Task.user_id == user.id)

    rows = query.order_by(Task.completed, Task.sort_order, Task.id).all()
    return [_to_out(task, uid, uname) for task, uid, uname in rows]


@router.post("", response_model=TaskOut)
def create_task(payload: TaskCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    anchor = _anchor_for(payload.scope)
    max_order = (
        db.query(func.coalesce(func.max(Task.sort_order), 0))
        .filter(Task.user_id == user.id, Task.scope == payload.scope, Task.anchor_date == anchor)
        .scalar()
    )
    task = Task(
        user_id=user.id,
        title=payload.title,
        scope=payload.scope,
        anchor_date=anchor,
        sort_order=(max_order or 0) + 1,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return _to_out(task, user.id, user.name)


@router.put("/reorder", response_model=list[TaskOut])
def reorder_tasks(
    payload: TaskReorder, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """Set the order of a column. Tasks are moved into `payload.scope` (with the
    matching anchor date) and given `sort_order` equal to their list index — this
    handles both reordering within a column and dragging a task to the other one.
    """
    anchor = _anchor_for(payload.scope)
    updated: list[Task] = []
    for index, task_id in enumerate(payload.ids):
        task = _get_owned(db, task_id, user)
        task.scope = payload.scope
        task.anchor_date = anchor
        task.sort_order = index
        db.add(task)
        updated.append(task)
    db.commit()
    for task in updated:
        db.refresh(task)
    return [_to_out(task, user.id, user.name) for task in updated]


@router.patch("/{task_id}", response_model=TaskOut)
def update_task(
    task_id: int, payload: TaskUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    task = _get_owned(db, task_id, user)
    if payload.title is not None:
        task.title = payload.title
    # `status` is authoritative; `completed` is a legacy alias. Keep both in sync.
    if payload.status is not None:
        task.status = payload.status
        task.completed = payload.status == "done"
    elif payload.completed is not None:
        task.completed = payload.completed
        task.status = "done" if payload.completed else "todo"
    db.add(task)
    db.commit()
    db.refresh(task)
    return _to_out(task, user.id, user.name)


@router.delete("/{task_id}", status_code=204)
def delete_task(task_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    task = _get_owned(db, task_id, user)
    db.delete(task)
    db.commit()
