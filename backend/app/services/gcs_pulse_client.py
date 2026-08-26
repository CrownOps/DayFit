import json
from datetime import date

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


def _send(client: httpx.Client, method: str, url: str, **kwargs) -> httpx.Response:
    """Issue a request, turning transport-level failures into GcsPulseError.

    Without this an upstream timeout or a dropped connection escapes as a raw
    ``httpx`` exception, which Starlette turns into a bare 500 — the browser
    then sees a CORS error instead of the real reason.
    """
    try:
        return client.request(method, url, **kwargs)
    except httpx.TimeoutException:
        raise GcsPulseError(
            504, "GCS Pulse 응답이 너무 오래 걸려 요청이 취소되었습니다. 잠시 후 다시 시도해 주세요."
        ) from None
    except httpx.HTTPError as exc:
        raise GcsPulseError(502, f"GCS Pulse에 연결하지 못했습니다: {exc}") from exc


def _decode_stream_text(raw: str) -> str:
    """Flatten a server-sent-event body into plain text.

    The AI endpoints (`/organize`, `/feedback`) can answer with an SSE stream
    instead of JSON. Each ``data:`` line carries either a bare text chunk or a
    small JSON object holding one; concatenating them rebuilds the answer.
    """
    parts: list[str] = []
    for line in raw.splitlines():
        line = line.strip()
        if not line.startswith("data:"):
            continue
        chunk = line[len("data:"):].strip()
        if not chunk or chunk == "[DONE]":
            continue
        try:
            payload = json.loads(chunk)
        except ValueError:
            parts.append(chunk)
            continue
        if isinstance(payload, str):
            parts.append(payload)
        elif isinstance(payload, dict):
            for key in ("organized_content", "feedback", "content", "delta", "text"):
                value = payload.get(key)
                if isinstance(value, str):
                    parts.append(value)
                    break
    return "".join(parts)


def _ai_payload(resp: httpx.Response, field: str) -> tuple[str, str | None]:
    """``(text, date)`` from an AI endpoint that may answer with JSON or SSE."""
    try:
        payload = resp.json()
    except ValueError:
        return _decode_stream_text(resp.text), None

    if not isinstance(payload, dict):
        return "", None
    value = payload.get(field)
    text = value if isinstance(value, str) else ""
    if not text.strip():
        # A JSON envelope whose field came back empty can still have the real
        # answer streamed in the body.
        text = _decode_stream_text(resp.text) or text
    snippet_date = payload.get("date")
    return text, snippet_date if isinstance(snippet_date, str) else None


def _raise_for_status(resp: httpx.Response) -> None:
    if resp.status_code >= 400:
        # GCS Pulse is itself a FastAPI service, so its error bodies are
        # usually `{"detail": "..."}`; unwrap that instead of forwarding raw
        # JSON text as the error message.
        detail = resp.text
        try:
            body = resp.json()
            if isinstance(body, dict) and isinstance(body.get("detail"), str):
                detail = body["detail"]
        except ValueError:
            pass
        raise GcsPulseError(resp.status_code, detail)


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
        resp = _send(client, "GET", "/daily-snippets", params=params)
        _raise_for_status(resp)
        return resp.json()


def get_daily_snippet(user: User, snippet_id: int) -> dict:
    with _client(user) as client:
        resp = _send(client, "GET", f"/daily-snippets/{snippet_id}")
        _raise_for_status(resp)
        return resp.json()


def create_daily_snippet(user: User, content: str) -> dict:
    with _client(user) as client:
        resp = _send(client, "POST", "/daily-snippets", json={"content": content})
        _raise_for_status(resp)
        return resp.json()


def update_daily_snippet(user: User, snippet_id: int, content: str) -> dict:
    with _client(user) as client:
        resp = _send(client, "PUT", f"/daily-snippets/{snippet_id}", json={"content": content})
        _raise_for_status(resp)
        return resp.json()


def delete_daily_snippet(user: User, snippet_id: int) -> None:
    with _client(user) as client:
        resp = _send(client, "DELETE", f"/daily-snippets/{snippet_id}")
        _raise_for_status(resp)


def organize_daily_snippet(user: User, content: str) -> dict:
    """AI 제안: reorganize/improve a draft snippet. Returns {date, organized_content}.

    ``stream=false`` is explicit: the upstream endpoint can answer with an SSE
    stream, whose body is not JSON. The response is parsed defensively either
    way (see ``_ai_payload``), and an empty answer is reported as an error
    rather than surfacing in the UI as a blank 제안 panel.

    The GCS Pulse side runs an LLM, so allow a generous timeout.
    """
    with _client(user, timeout=120.0) as client:
        resp = _send(
            client,
            "POST",
            "/daily-snippets/organize",
            params={"stream": "false"},
            json={"content": content},
        )
        _raise_for_status(resp)
        organized, snippet_date = _ai_payload(resp, "organized_content")

    if not organized.strip():
        raise GcsPulseError(502, "AI가 정리한 내용을 받지 못했습니다. 잠시 후 다시 시도해 주세요.")
    return {"date": snippet_date or date.today().isoformat(), "organized_content": organized}


def generate_daily_snippet_feedback(user: User) -> dict:
    """AI 채점: grade today's saved snippet. Returns {date, feedback}.

    Operates on the user's already-saved snippet for today (no body), so the
    caller must have created/updated today's snippet first.
    """
    with _client(user, timeout=120.0) as client:
        resp = _send(client, "GET", "/daily-snippets/feedback", params={"stream": "false"})
        _raise_for_status(resp)
        feedback, snippet_date = _ai_payload(resp, "feedback")

    if not feedback.strip():
        raise GcsPulseError(502, "AI 채점 결과를 받지 못했습니다. 잠시 후 다시 시도해 주세요.")
    return {"date": snippet_date or date.today().isoformat(), "feedback": feedback}


def create_comment(user: User, daily_snippet_id: int, content: str) -> dict:
    with _client(user) as client:
        resp = _send(
            client, "POST", "/comments", json={"content": content, "daily_snippet_id": daily_snippet_id}
        )
        _raise_for_status(resp)
        return resp.json()


def get_token_usage(user: User) -> dict:
    with _client(user) as client:
        resp = _send(client, "GET", "/users/me/token-usage")
        _raise_for_status(resp)
        return resp.json()


def list_meeting_rooms(user: User) -> list[dict]:
    with _client(user) as client:
        resp = _send(client, "GET", "/meeting-rooms")
        _raise_for_status(resp)
        return resp.json()


def list_room_reservations(user: User, room_id: int, date: str) -> list[dict]:
    with _client(user) as client:
        resp = _send(client, "GET", f"/meeting-rooms/{room_id}/reservations", params={"date": date})
        _raise_for_status(resp)
        return resp.json()


def create_room_reservation(user: User, room_id: int, start_at: str, end_at: str, purpose: str | None) -> dict:
    with _client(user) as client:
        resp = _send(
            client,
            "POST",
            f"/meeting-rooms/{room_id}/reservations",
            json={"start_at": start_at, "end_at": end_at, "purpose": purpose},
        )
        _raise_for_status(resp)
        return resp.json()


def cancel_room_reservation(user: User, reservation_id: int) -> None:
    # Like delete_daily_snippet, GCS Pulse's DELETE returns no body (204) — it
    # used to be treated as returning JSON here, which raised an unhandled
    # JSON-decode error on every cancel and silently aborted the whole
    # request (including the loop in recurring_reservation_service.cancel_rule,
    # which left the recurring rule stuck "active").
    with _client(user) as client:
        resp = _send(client, "DELETE", f"/meeting-rooms/reservations/{reservation_id}")
        _raise_for_status(resp)
