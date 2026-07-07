from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

BookStatus = Literal["want", "reading", "done"]
BookScope = Literal["own", "team"]


class BookOwner(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class BookCreate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    author: str = Field(default="", max_length=255)
    status: BookStatus = "want"
    rating: Optional[int] = Field(default=None, ge=1, le=5)
    review: str = ""


class BookUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=500)
    author: Optional[str] = Field(default=None, max_length=255)
    status: Optional[BookStatus] = None
    rating: Optional[int] = Field(default=None, ge=1, le=5)
    review: Optional[str] = None


class BookOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    author: str
    status: BookStatus
    rating: Optional[int]
    review: str
    owner: Optional[BookOwner] = None
    created_at: datetime
    updated_at: datetime
