from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class TeamProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    team_id: str
    vision: str
    mission: str


class TeamProfileUpdate(BaseModel):
    vision: str = ""
    mission: str = ""


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
