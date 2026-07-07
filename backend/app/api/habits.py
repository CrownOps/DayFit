from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.habit import Habit, HabitLog
from app.models.user import User
from app.schemas.habit import HabitCreate, HabitLogOut, HabitOut, HabitStats, HabitUpdate
from app.services import habit_service

router = APIRouter(prefix="/api/habits", tags=["habits"])


def _get_owned_habit(db: Session, habit_id: int, user: User) -> Habit:
    habit = db.get(Habit, habit_id)
    if habit is None or habit.user_id != user.id:
        raise HTTPException(status_code=404, detail="Habit not found")
    return habit


@router.get("", response_model=list[HabitOut])
def list_habits(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(Habit).filter(Habit.user_id == user.id).order_by(Habit.target_time).all()


@router.post("", response_model=HabitOut)
def create_habit(payload: HabitCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    habit = Habit(user_id=user.id, **payload.model_dump())
    db.add(habit)
    db.commit()
    db.refresh(habit)
    return habit


@router.patch("/{habit_id}", response_model=HabitOut)
def update_habit(
    habit_id: int, payload: HabitUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    habit = _get_owned_habit(db, habit_id, user)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(habit, key, value)
    db.add(habit)
    db.commit()
    db.refresh(habit)
    return habit


@router.delete("/{habit_id}", status_code=204)
def delete_habit(habit_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    habit = _get_owned_habit(db, habit_id, user)
    db.delete(habit)
    db.commit()


@router.post("/{habit_id}/logs/{log_date}", response_model=HabitLogOut)
def set_completion(
    habit_id: int,
    log_date: date,
    completed: bool = Query(True),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    habit = _get_owned_habit(db, habit_id, user)
    return habit_service.toggle_completion(db, habit, log_date, completed)


@router.get("/logs", response_model=list[HabitLogOut])
def list_logs(
    date_: date = Query(alias="date"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    habit_ids = [h.id for h in db.query(Habit).filter(Habit.user_id == user.id).all()]
    return db.query(HabitLog).filter(HabitLog.habit_id.in_(habit_ids), HabitLog.date == date_).all()


@router.get("/logs/range", response_model=list[HabitLogOut])
def list_logs_range(
    from_date: date = Query(...),
    to_date: date = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """All habit logs for the user within [from_date, to_date] — powers the
    completion heatmap on the 데일리 루틴 page."""
    habit_ids = [h.id for h in db.query(Habit).filter(Habit.user_id == user.id).all()]
    if not habit_ids:
        return []
    return (
        db.query(HabitLog)
        .filter(
            HabitLog.habit_id.in_(habit_ids),
            HabitLog.date >= from_date,
            HabitLog.date <= to_date,
        )
        .all()
    )


@router.get("/missed", response_model=list[HabitOut])
def missed_habits(
    date_: date = Query(alias="date"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    habits = db.query(Habit).filter(Habit.user_id == user.id, Habit.active.is_(True)).all()
    return habit_service.missed_habits_for_date(db, habits, date_)


@router.get("/{habit_id}/stats", response_model=HabitStats)
def habit_monthly_stats(
    habit_id: int,
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    habit = _get_owned_habit(db, habit_id, user)
    scheduled, completed = habit_service.monthly_completion_rate(db, habit, year, month)
    rate = (completed / scheduled) if scheduled else 0.0
    return HabitStats(
        habit_id=habit.id,
        month=f"{year:04d}-{month:02d}",
        total_days=scheduled,
        completed_days=completed,
        completion_rate=round(rate, 4),
    )
