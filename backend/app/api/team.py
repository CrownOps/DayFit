from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_admin, get_current_user
from app.models.team import Team, TeamRule
from app.models.user import User
from app.schemas.team import (
    TeamPermissionsOut,
    TeamPermissionsUpdate,
    TeamProfileOut,
    TeamProfileUpdate,
    TeamRuleCreate,
    TeamRuleOut,
    TeamRuleUpdate,
)

# Note: no prefix so these sit alongside /api/team/health (defined in snippets router).
router = APIRouter(tags=["team-space"])


def _require_team(user: User) -> str:
    if not user.team_id:
        raise HTTPException(status_code=400, detail="팀에 소속되어 있지 않습니다")
    return user.team_id


def _get_or_create_team(db: Session, team_id: str) -> Team:
    team = db.get(Team, team_id)
    if team is None:
        team = Team(team_id=team_id)
        db.add(team)
        db.flush()
    return team


# ---- Edit permissions -----------------------------------------------------
#
# 팀룰과 비전/미션은 각각 "관리자만"(admin) 또는 "팀원 전체"(member)로 수정 권한을
# 열 수 있다. 정책은 관리자만 바꿀 수 있고, 관리자는 정책과 무관하게 항상 수정 가능.

_POLICY_FIELDS = {"rules": "rules_edit_policy", "profile": "profile_edit_policy"}

_POLICY_DENIED = {
    "rules": "팀룰은 관리자만 수정할 수 있습니다",
    "profile": "비전·미션은 관리자만 수정할 수 있습니다",
}


def _policy(db: Session, team_id: str, section: str) -> str:
    team = db.get(Team, team_id)
    return getattr(team, _POLICY_FIELDS[section], "admin") if team else "admin"


def _can_edit(db: Session, user: User, team_id: str, section: str) -> bool:
    return user.is_admin or _policy(db, team_id, section) == "member"


def _require_can_edit(db: Session, user: User, team_id: str, section: str) -> None:
    if not _can_edit(db, user, team_id, section):
        raise HTTPException(status_code=403, detail=_POLICY_DENIED[section])


@router.get("/api/team/permissions", response_model=TeamPermissionsOut)
def get_team_permissions(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    team_id = _require_team(user)
    return TeamPermissionsOut(
        rules_edit_policy=_policy(db, team_id, "rules"),
        profile_edit_policy=_policy(db, team_id, "profile"),
        can_edit_rules=_can_edit(db, user, team_id, "rules"),
        can_edit_profile=_can_edit(db, user, team_id, "profile"),
        is_admin=user.is_admin,
    )


@router.put("/api/team/permissions", response_model=TeamPermissionsOut)
def update_team_permissions(
    payload: TeamPermissionsUpdate,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    team_id = _require_team(admin)
    team = _get_or_create_team(db, team_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(team, field, value)
    db.commit()
    db.refresh(team)
    return TeamPermissionsOut(
        rules_edit_policy=team.rules_edit_policy,
        profile_edit_policy=team.profile_edit_policy,
        can_edit_rules=True,
        can_edit_profile=True,
        is_admin=True,
    )


# ---- Vision / mission (team-wide) ----
@router.get("/api/team/profile", response_model=TeamProfileOut)
def get_team_profile(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    team_id = _require_team(user)
    team = db.get(Team, team_id)
    if team is None:
        return TeamProfileOut(team_id=team_id, vision="", mission="")
    return team


@router.put("/api/team/profile", response_model=TeamProfileOut)
def update_team_profile(
    payload: TeamProfileUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    team_id = _require_team(user)
    _require_can_edit(db, user, team_id, "profile")
    team = _get_or_create_team(db, team_id)
    team.vision = payload.vision
    team.mission = payload.mission
    db.commit()
    db.refresh(team)
    return team


# ---- Team rules ----
@router.get("/api/team/rules", response_model=list[TeamRuleOut])
def list_team_rules(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    team_id = _require_team(user)
    return (
        db.query(TeamRule)
        .filter(TeamRule.team_id == team_id)
        .order_by(TeamRule.sort_order, TeamRule.id)
        .all()
    )


@router.post("/api/team/rules", response_model=TeamRuleOut)
def create_team_rule(
    payload: TeamRuleCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    team_id = _require_team(user)
    _require_can_edit(db, user, team_id, "rules")
    max_order = (
        db.query(func.coalesce(func.max(TeamRule.sort_order), 0))
        .filter(TeamRule.team_id == team_id)
        .scalar()
    )
    rule = TeamRule(team_id=team_id, content=payload.content, sort_order=(max_order or 0) + 1)
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


def _get_owned_rule(db: Session, rule_id: int, user: User) -> TeamRule:
    rule = db.get(TeamRule, rule_id)
    if rule is None or rule.team_id != user.team_id:
        raise HTTPException(status_code=404, detail="Rule not found")
    return rule


@router.patch("/api/team/rules/{rule_id}", response_model=TeamRuleOut)
def update_team_rule(
    rule_id: int,
    payload: TeamRuleUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_can_edit(db, user, _require_team(user), "rules")
    rule = _get_owned_rule(db, rule_id, user)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(rule, field, value)
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


@router.delete("/api/team/rules/{rule_id}", status_code=204)
def delete_team_rule(
    rule_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    _require_can_edit(db, user, _require_team(user), "rules")
    rule = _get_owned_rule(db, rule_id, user)
    db.delete(rule)
    db.commit()
