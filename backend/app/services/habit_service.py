from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.models.habit import Habit, HabitLog


def is_scheduled_day(habit: Habit, d: date) -> bool:
    if not habit.repeat_days:
        return True
    days = {int(x) for x in habit.repeat_days.split(",") if x != ""}
    return d.weekday() in days


def recompute_streak(db: Session, habit: Habit, up_to: date) -> int:
    """Walk backward from `up_to` over scheduled days, counting consecutive completions."""
    logs_by_date = {
        log.date: log
        for log in db.query(HabitLog).filter(HabitLog.habit_id == habit.id, HabitLog.date <= up_to).all()
    }

    streak = 0
    cursor = up_to
    while True:
        if is_scheduled_day(habit, cursor):
            log = logs_by_date.get(cursor)
            if log is not None and log.completed:
                streak += 1
            else:
                break
        cursor -= timedelta(days=1)
        if (up_to - cursor).days > 3660:  # 10-year safety cap
            break
    return streak


def toggle_completion(db: Session, habit: Habit, d: date, completed: bool) -> HabitLog:
    log = db.query(HabitLog).filter(HabitLog.habit_id == habit.id, HabitLog.date == d).first()
    if log is None:
        log = HabitLog(habit_id=habit.id, date=d, completed=completed, streak_count=0)
        db.add(log)
    else:
        log.completed = completed

    db.flush()
    log.streak_count = recompute_streak(db, habit, d) if completed else 0
    db.commit()
    db.refresh(log)
    return log


def missed_habits_for_date(db: Session, habits: list[Habit], d: date) -> list[Habit]:
    logs_by_habit = {
        log.habit_id: log
        for log in db.query(HabitLog).filter(HabitLog.date == d, HabitLog.habit_id.in_([h.id for h in habits])).all()
    }
    missed = []
    for habit in habits:
        if not habit.active or not is_scheduled_day(habit, d):
            continue
        log = logs_by_habit.get(habit.id)
        if log is None or not log.completed:
            missed.append(habit)
    return missed


def monthly_completion_rate(db: Session, habit: Habit, year: int, month: int) -> tuple[int, int]:
    start = date(year, month, 1)
    end = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)

    scheduled_days = 0
    cursor = start
    while cursor < end and cursor <= date.today():
        if is_scheduled_day(habit, cursor):
            scheduled_days += 1
        cursor += timedelta(days=1)

    completed_days = (
        db.query(HabitLog)
        .filter(HabitLog.habit_id == habit.id, HabitLog.date >= start, HabitLog.date < end, HabitLog.completed.is_(True))
        .count()
    )
    return scheduled_days, completed_days
