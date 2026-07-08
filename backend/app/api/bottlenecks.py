from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.bottleneck import Bottleneck, BottleneckAction
from app.models.user import User
from app.schemas.bottleneck import (
    ActionCreate,
    ActionOut,
    ActionUpdate,
    BottleneckCreate,
    BottleneckOut,
    BottleneckUpdate,
    PersonRef,
)

router = APIRouter(prefix="/api/bottlenecks", tags=["bottlenecks"])

# Lower number sorts first: highest priority and still-open items float to the top.
_PRIORITY_ORDER = {"high": 0, "medium": 1, "low": 2}
_STATUS_ORDER = {"open": 0, "in_progress": 1, "resolved": 2}


def _require_team(user: User) -> str:
    if not user.team_id:
        raise HTTPException(status_code=400, detail="팀에 소속되어 있지 않습니다")
    return user.team_id


def _name_map(db: Session, user_ids: set[int]) -> dict[int, str]:
    if not user_ids:
        return {}
    rows = db.query(User.id, User.name).filter(User.id.in_(user_ids)).all()
    return {uid: name for uid, name in rows}


def _person(names: dict[int, str], uid: int) -> PersonRef:
    return PersonRef(id=uid, name=names.get(uid, "알 수 없음"))


def _action_out(action: BottleneckAction, names: dict[int, str]) -> ActionOut:
    return ActionOut(
        id=action.id,
        bottleneck_id=action.bottleneck_id,
        content=action.content,
        effect=action.effect,
        done=action.done,
        creator=_person(names, action.user_id),
        created_at=action.created_at,
        updated_at=action.updated_at,
    )


def _bottleneck_out(b: Bottleneck, names: dict[int, str]) -> BottleneckOut:
    return BottleneckOut(
        id=b.id,
        title=b.title,
        description=b.description,
        priority=b.priority,
        status=b.status,
        occurred_at=b.occurred_at,
        deadline=b.deadline,
        creator=_person(names, b.user_id),
        actions=[_action_out(a, names) for a in b.actions],
        created_at=b.created_at,
        updated_at=b.updated_at,
    )


def _collect_user_ids(items: list[Bottleneck]) -> set[int]:
    ids: set[int] = set()
    for b in items:
        ids.add(b.user_id)
        for a in b.actions:
            ids.add(a.user_id)
    return ids


def _get_team_bottleneck(db: Session, bottleneck_id: int, user: User) -> Bottleneck:
    b = (
        db.query(Bottleneck)
        .options(selectinload(Bottleneck.actions))
        .filter(Bottleneck.id == bottleneck_id)
        .first()
    )
    if b is None or b.team_id != user.team_id:
        raise HTTPException(status_code=404, detail="Bottleneck not found")
    return b


@router.get("", response_model=list[BottleneckOut])
def list_bottlenecks(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Every bottleneck for the caller's team, sorted by status then priority then deadline."""
    team_id = _require_team(user)
    items = (
        db.query(Bottleneck)
        .options(selectinload(Bottleneck.actions))
        .filter(Bottleneck.team_id == team_id)
        .all()
    )

    def sort_key(b: Bottleneck):
        deadline = b.deadline.timestamp() if b.deadline else float("inf")
        return (
            _STATUS_ORDER.get(b.status, 9),
            _PRIORITY_ORDER.get(b.priority, 9),
            deadline,
            -b.id,
        )

    items.sort(key=sort_key)
    names = _name_map(db, _collect_user_ids(items))
    return [_bottleneck_out(b, names) for b in items]


@router.post("", response_model=BottleneckOut)
def create_bottleneck(
    payload: BottleneckCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    team_id = _require_team(user)
    b = Bottleneck(
        team_id=team_id,
        user_id=user.id,
        title=payload.title,
        description=payload.description,
        priority=payload.priority,
        status=payload.status,
        occurred_at=payload.occurred_at or datetime.now(timezone.utc),
        deadline=payload.deadline,
    )
    db.add(b)
    db.commit()
    db.refresh(b)
    return _bottleneck_out(b, _name_map(db, {user.id}))


@router.patch("/{bottleneck_id}", response_model=BottleneckOut)
def update_bottleneck(
    bottleneck_id: int,
    payload: BottleneckUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Any teammate may update a shared bottleneck (status, priority, fields)."""
    _require_team(user)
    b = _get_team_bottleneck(db, bottleneck_id, user)
    data = payload.model_dump(exclude_unset=True)
    # occurred_at is non-null; ignore an explicit null so it can't be cleared.
    if data.get("occurred_at") is None:
        data.pop("occurred_at", None)
    for field, value in data.items():
        setattr(b, field, value)
    db.commit()
    db.refresh(b)
    return _bottleneck_out(b, _name_map(db, _collect_user_ids([b])))


@router.delete("/{bottleneck_id}", status_code=204)
def delete_bottleneck(
    bottleneck_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """Only the creator (or an admin) may delete a bottleneck."""
    _require_team(user)
    b = _get_team_bottleneck(db, bottleneck_id, user)
    if b.user_id != user.id and not user.is_admin:
        raise HTTPException(status_code=403, detail="삭제 권한이 없습니다")
    db.delete(b)
    db.commit()


# ---- Actions ----
@router.post("/{bottleneck_id}/actions", response_model=ActionOut)
def add_action(
    bottleneck_id: int,
    payload: ActionCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_team(user)
    b = _get_team_bottleneck(db, bottleneck_id, user)
    action = BottleneckAction(
        bottleneck_id=b.id,
        user_id=user.id,
        content=payload.content,
        effect=payload.effect,
        done=payload.done,
    )
    db.add(action)
    db.commit()
    db.refresh(action)
    return _action_out(action, _name_map(db, {user.id}))


def _get_team_action(db: Session, bottleneck_id: int, action_id: int, user: User) -> BottleneckAction:
    b = _get_team_bottleneck(db, bottleneck_id, user)  # enforces team access
    action = db.get(BottleneckAction, action_id)
    if action is None or action.bottleneck_id != b.id:
        raise HTTPException(status_code=404, detail="Action not found")
    return action


@router.patch("/{bottleneck_id}/actions/{action_id}", response_model=ActionOut)
def update_action(
    bottleneck_id: int,
    action_id: int,
    payload: ActionUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Any teammate may record an action's effect or mark it done."""
    _require_team(user)
    action = _get_team_action(db, bottleneck_id, action_id, user)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(action, field, value)
    db.commit()
    db.refresh(action)
    return _action_out(action, _name_map(db, {action.user_id}))


@router.delete("/{bottleneck_id}/actions/{action_id}", status_code=204)
def delete_action(
    bottleneck_id: int,
    action_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Only the action's creator (or an admin) may delete it."""
    _require_team(user)
    action = _get_team_action(db, bottleneck_id, action_id, user)
    if action.user_id != user.id and not user.is_admin:
        raise HTTPException(status_code=403, detail="삭제 권한이 없습니다")
    db.delete(action)
    db.commit()
