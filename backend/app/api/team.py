from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_admin, get_current_user
from app.models.team import Team, TeamRule
from app.models.user import User
from app.schemas.team import (
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
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    team_id = _require_team(admin)
    team = db.get(Team, team_id)
    if team is None:
        team = Team(team_id=team_id)
        db.add(team)
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
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    team_id = _require_team(admin)
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


def _get_owned_rule(db: Session, rule_id: int, admin: User) -> TeamRule:
    rule = db.get(TeamRule, rule_id)
    if rule is None or rule.team_id != admin.team_id:
        raise HTTPException(status_code=404, detail="Rule not found")
    return rule


@router.patch("/api/team/rules/{rule_id}", response_model=TeamRuleOut)
def update_team_rule(
    rule_id: int,
    payload: TeamRuleUpdate,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    rule = _get_owned_rule(db, rule_id, admin)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(rule, field, value)
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


@router.delete("/api/team/rules/{rule_id}", status_code=204)
def delete_team_rule(
    rule_id: int, admin: User = Depends(get_current_admin), db: Session = Depends(get_db)
):
    rule = _get_owned_rule(db, rule_id, admin)
    db.delete(rule)
    db.commit()
