from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.task import Task
from app.models.user import User
from app.schemas.task import Scope, TaskCreate, TaskOut, TaskUpdate

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


@router.get("", response_model=list[TaskOut])
def list_tasks(
    scope: Scope = Query("today"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Tasks for the current day (scope=today) or current week (scope=week)."""
    anchor = _anchor_for(scope)
    return (
        db.query(Task)
        .filter(Task.user_id == user.id, Task.scope == scope, Task.anchor_date == anchor)
        .order_by(Task.completed, Task.sort_order, Task.id)
        .all()
    )


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
    return task


@router.patch("/{task_id}", response_model=TaskOut)
def update_task(
    task_id: int, payload: TaskUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    task = _get_owned(db, task_id, user)
    if payload.title is not None:
        task.title = payload.title
    if payload.completed is not None:
        task.completed = payload.completed
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@router.delete("/{task_id}", status_code=204)
def delete_task(task_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    task = _get_owned(db, task_id, user)
    db.delete(task)
    db.commit()
