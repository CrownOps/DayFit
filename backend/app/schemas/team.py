from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

# "admin" = 관리자만 수정, "member" = 팀원 누구나 수정.
EditPolicy = Literal["admin", "member"]


class TeamProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    team_id: str
    vision: str
    mission: str


class TeamProfileUpdate(BaseModel):
    vision: str = ""
    mission: str = ""


class TeamPermissionsOut(BaseModel):
    """Edit policies for the team space, plus what the caller may actually do."""

    rules_edit_policy: EditPolicy
    profile_edit_policy: EditPolicy
    can_edit_rules: bool
    can_edit_profile: bool
    is_admin: bool


class TeamPermissionsUpdate(BaseModel):
    rules_edit_policy: Optional[EditPolicy] = None
    profile_edit_policy: Optional[EditPolicy] = None


class TeamRuleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    content: str
    sort_order: int


class TeamRuleCreate(BaseModel):
    content: str = Field(min_length=1)


class TeamRuleUpdate(BaseModel):
    content: Optional[str] = Field(default=None, min_length=1)
    sort_order: Optional[int] = None
