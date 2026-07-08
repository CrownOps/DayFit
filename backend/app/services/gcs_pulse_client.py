import httpx

from app.core.config import settings
from app.core.security import decrypt_secret
from app.models.user import User


class GcsPulseError(Exception):
    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


def _client(user: User, timeout: float = 15.0) -> httpx.Client:
    if not user.gcs_pulse_api_token_encrypted:
        raise GcsPulseError(400, "GCS Pulse API 토큰이 등록되어 있지 않습니다")

    token = decrypt_secret(user.gcs_pulse_api_token_encrypted)
    return httpx.Client(
        base_url=settings.gcs_pulse_base_url,
        headers={"Authorization": f"Bearer {token}"},
        timeout=timeout,
    )


def _raise_for_status(resp: httpx.Response) -> None:
    if resp.status_code >= 400:
        raise GcsPulseError(resp.status_code, resp.text)


def list_daily_snippets(
    user: User,
    scope: str = "own",
    from_date: str | None = None,
    to_date: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> dict:
    params = {"scope": scope, "limit": limit, "offset": offset}
    if from_date:
        params["from_date"] = from_date
    if to_date:
        params["to_date"] = to_date

    with _client(user) as client:
        resp = client.get("/daily-snippets", params=params)
        _raise_for_status(resp)
        return resp.json()


def get_daily_snippet(user: User, snippet_id: int) -> dict:
    with _client(user) as client:
        resp = client.get(f"/daily-snippets/{snippet_id}")
        _raise_for_status(resp)
        return resp.json()


def create_daily_snippet(user: User, content: str) -> dict:
    with _client(user) as client:
        resp = client.post("/daily-snippets", json={"content": content})
        _raise_for_status(resp)
        return resp.json()


def update_daily_snippet(user: User, snippet_id: int, content: str) -> dict:
    with _client(user) as client:
        resp = client.put(f"/daily-snippets/{snippet_id}", json={"content": content})
        _raise_for_status(resp)
        return resp.json()


def delete_daily_snippet(user: User, snippet_id: int) -> None:
    with _client(user) as client:
        resp = client.delete(f"/daily-snippets/{snippet_id}")
        _raise_for_status(resp)


def organize_daily_snippet(user: User, content: str) -> dict:
    """AI 제안: reorganize/improve a draft snippet. Returns {date, organized_content}.

    The GCS Pulse side runs an LLM, so allow a generous timeout.
    """
    with _client(user, timeout=60.0) as client:
        resp = client.post("/daily-snippets/organize", json={"content": content})
        _raise_for_status(resp)
        return resp.json()


def generate_daily_snippet_feedback(user: User) -> dict:
    """AI 채점: grade today's saved snippet. Returns {date, feedback}.

    Operates on the user's already-saved snippet for today (no body), so the
    caller must have created/updated today's snippet first.
    """
    with _client(user, timeout=60.0) as client:
        resp = client.get("/daily-snippets/feedback")
        _raise_for_status(resp)
        return resp.json()


def create_comment(user: User, daily_snippet_id: int, content: str) -> dict:
    with _client(user) as client:
        resp = client.post("/comments", json={"content": content, "daily_snippet_id": daily_snippet_id})
        _raise_for_status(resp)
        return resp.json()


def get_token_usage(user: User) -> dict:
    with _client(user) as client:
        resp = client.get("/users/me/token-usage")
        _raise_for_status(resp)
        return resp.json()
