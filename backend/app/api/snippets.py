from calendar import monthrange
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.snippet import (
    HeatmapDay,
    SnippetAuthor,
    SnippetCreate,
    SnippetFeedbackOut,
    SnippetOrganizeOut,
    SnippetOut,
    SnippetUpdate,
    TeamHealthEntry,
)
from app.services import gcs_pulse_client as gcs
from app.services.gcs_pulse_client import GcsPulseError
from app.services.snippet_parser import extract_ai_score, extract_condition_score

router = APIRouter(tags=["snippets"])


def _to_snippet_out(item: dict) -> SnippetOut:
    author = None
    if item.get("user"):
        author = SnippetAuthor(id=item["user"]["id"], name=item["user"]["name"], email=item["user"].get("email"))
    return SnippetOut(
        id=item["id"],
        user_id=item["user_id"],
        author=author,
        date=item["date"],
        content=item["content"],
        condition_score=extract_condition_score(item["content"]),
        ai_score=extract_ai_score(item.get("feedback")),
        created_at=item["created_at"],
        updated_at=item["updated_at"],
    )


@router.get("/api/snippets", response_model=list[SnippetOut])
def list_snippets(
    scope: str = Query("own", pattern="^(own|team)$"),
    from_date: str | None = None,
    to_date: str | None = None,
    user: User = Depends(get_current_user),
):
    try:
        result = gcs.list_daily_snippets(user, scope=scope, from_date=from_date, to_date=to_date, limit=200)
    except GcsPulseError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)
    return [_to_snippet_out(item) for item in result.get("items", [])]


@router.post("/api/snippets", response_model=SnippetOut)
def create_snippet(payload: SnippetCreate, user: User = Depends(get_current_user)):
    try:
        item = gcs.create_daily_snippet(user, payload.content)
    except GcsPulseError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)
    return _to_snippet_out(item)


@router.post("/api/snippets/organize", response_model=SnippetOrganizeOut)
def organize_snippet(payload: SnippetCreate, user: User = Depends(get_current_user)):
    """AI 제안: return an AI-reorganized version of the draft (does not save)."""
    try:
        item = gcs.organize_daily_snippet(user, payload.content)
    except GcsPulseError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)
    return SnippetOrganizeOut(date=item["date"], organized_content=item["organized_content"])


@router.get("/api/snippets/feedback", response_model=SnippetFeedbackOut)
def snippet_feedback(user: User = Depends(get_current_user)):
    """AI 채점: grade the user's saved snippet for today and return the score."""
    try:
        item = gcs.generate_daily_snippet_feedback(user)
    except GcsPulseError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)
    feedback = item.get("feedback")
    return SnippetFeedbackOut(
        date=item["date"],
        ai_score=extract_ai_score(feedback),
        feedback=feedback,
    )


@router.put("/api/snippets/{snippet_id}", response_model=SnippetOut)
def update_snippet(snippet_id: int, payload: SnippetUpdate, user: User = Depends(get_current_user)):
    try:
        item = gcs.update_daily_snippet(user, snippet_id, payload.content)
    except GcsPulseError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)
    return _to_snippet_out(item)


@router.delete("/api/snippets/{snippet_id}", status_code=204)
def delete_snippet(snippet_id: int, user: User = Depends(get_current_user)):
    try:
        gcs.delete_daily_snippet(user, snippet_id)
    except GcsPulseError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)


@router.get("/api/snippets/heatmap", response_model=list[HeatmapDay])
def snippet_heatmap(
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    scope: str = Query("own", pattern="^(own|team)$"),
    user: User = Depends(get_current_user),
):
    _, last_day = monthrange(year, month)
    from_date = date(year, month, 1).isoformat()
    to_date = date(year, month, last_day).isoformat()

    try:
        result = gcs.list_daily_snippets(user, scope=scope, from_date=from_date, to_date=to_date, limit=200)
    except GcsPulseError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)

    by_date: dict[str, dict] = {}
    for item in result.get("items", []):
        by_date.setdefault(item["date"], item)

    days = []
    for day_num in range(1, last_day + 1):
        d = date(year, month, day_num)
        item = by_date.get(d.isoformat())
        days.append(
            HeatmapDay(
                date=d,
                written=item is not None,
                condition_score=extract_condition_score(item["content"]) if item else None,
            )
        )
    return days


@router.post("/api/snippets/{snippet_id}/comments")
def comment_on_snippet(snippet_id: int, content: str, user: User = Depends(get_current_user)):
    try:
        return gcs.create_comment(user, snippet_id, content)
    except GcsPulseError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)


@router.get("/api/team/health", response_model=list[TeamHealthEntry])
def team_health(
    days: int = Query(14, ge=1, le=90),
    user: User = Depends(get_current_user),
):
    """Latest health-check per team member over the last `days` days.

    Shows every member who has written at least one snippet in the window
    (not just today's writers), using their most recent snippet's condition.
    """
    today = date.today()
    from_date = (today - timedelta(days=days)).isoformat()
    today_iso = today.isoformat()
    try:
        result = gcs.list_daily_snippets(user, scope="team", from_date=from_date, to_date=today_iso, limit=500)
    except GcsPulseError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)

    latest_by_user: dict[int, dict] = {}
    for item in result.get("items", []):
        uid = item["user_id"]
        prev = latest_by_user.get(uid)
        if prev is None or item["date"] > prev["date"]:
            latest_by_user[uid] = item

    entries = []
    for item in latest_by_user.values():
        member = item.get("user") or {}
        entries.append(
            TeamHealthEntry(
                user_id=item["user_id"],
                name=member.get("name", "알 수 없음"),
                date=item["date"],
                condition_score=extract_condition_score(item["content"]),
                has_snippet_today=item["date"] == today_iso,
                content_preview=item["content"][:120],
            )
        )
    entries.sort(key=lambda e: ((e.condition_score is None), e.condition_score or 0))
    return entries
