"""MCP server so Claude can manage DayFit tasks from a conversation.

Speaks the Model Context Protocol's Streamable HTTP transport in its stateless
form: every JSON-RPC message arrives as a POST and is answered with plain JSON
(no SSE stream, no session id). That's all a tool-only server needs, and it
keeps the endpoint an ordinary FastAPI route — same auth, same DB session.

Clients authenticate with a personal API token (발급: 설정 > Claude 연결):

    claude mcp add --transport http dayfit https://<host>/api/mcp \\
        --header "Authorization: Bearer dft_..."

The tools call the existing task route functions directly, so the rules the
web app follows (ordering, rollover, team-pool ownership) apply unchanged.
"""
from typing import Any, Callable

from fastapi import APIRouter, Body, Depends, HTTPException, Response
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.api import tasks as tasks_api
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.task import TaskCreate, TaskOut, TaskUpdate, TeamTaskCreate

router = APIRouter(prefix="/api/mcp", tags=["mcp"])

SERVER_INFO = {"name": "dayfit", "title": "DayFit 할 일", "version": "1.0.0"}
SUPPORTED_PROTOCOL_VERSIONS = ("2025-06-18", "2025-03-26", "2024-11-05")

INSTRUCTIONS = """DayFit는 사용자의 할 일 관리 앱이다.
- 개인 할 일은 '오늘'(today)과 '이번 주'(week) 두 칸으로 나뉜다. 날짜를 지정할 수는 없다.
  특정 날짜가 아니라 이번 주 안에만 하면 되는 일이면 week, 오늘 할 일이면 today에 넣는다.
- 오늘 칸의 미완료 할 일은 다음 날 자동으로 오늘로 넘어온다.
- 상태는 todo(할 일) → in_progress(진행 중) → done(완료).
- 팀 할 일 풀은 팀원 누구나 가져갈 수 있는 공용 목록이다. 사용자가 '팀'이라고 말할 때만 쓴다.
- 대화에서 여러 할 일이 나오면 add_tasks 한 번에 모아서 추가하고, 추가한 목록을 사용자에게 알려준다.
- 수정·삭제 전에는 list_tasks로 id를 확인한다."""

STATUS_LABEL = {"todo": "할 일", "in_progress": "진행 중", "done": "완료"}
SCOPE_LABEL = {"today": "오늘", "week": "이번 주", "team": "팀 풀"}

_TITLES = {
    "type": "array",
    "items": {"type": "string", "minLength": 1, "maxLength": 500},
    "minItems": 1,
    "description": "추가할 할 일 제목들. 짧고 행동 중심으로.",
}
_SCOPE = {
    "type": "string",
    "enum": ["today", "week"],
    "description": "today = 오늘 할 일, week = 이번 주 할 일",
}

TOOLS: list[dict[str, Any]] = [
    {
        "name": "list_tasks",
        "title": "할 일 목록",
        "description": "내 오늘/이번 주 할 일을 id·상태와 함께 보여준다.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "scope": {
                    "type": "string",
                    "enum": ["today", "week", "both"],
                    "default": "both",
                    "description": "어느 칸을 볼지. 기본은 둘 다.",
                }
            },
        },
        "annotations": {"readOnlyHint": True},
    },
    {
        "name": "add_tasks",
        "title": "할 일 추가",
        "description": "내 오늘 또는 이번 주 칸에 할 일을 하나 이상 추가한다.",
        "inputSchema": {
            "type": "object",
            "properties": {"titles": _TITLES, "scope": {**_SCOPE, "default": "today"}},
            "required": ["titles"],
        },
    },
    {
        "name": "update_task",
        "title": "할 일 수정",
        "description": "할 일의 제목, 상태(todo/in_progress/done), 칸(today/week)을 바꾼다. 바꿀 것만 넘긴다.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "task_id": {"type": "integer"},
                "title": {"type": "string", "minLength": 1, "maxLength": 500},
                "status": {"type": "string", "enum": ["todo", "in_progress", "done"]},
                "scope": _SCOPE,
            },
            "required": ["task_id"],
        },
    },
    {
        "name": "delete_task",
        "title": "할 일 삭제",
        "description": "내 할 일을 삭제한다. 되돌릴 수 없다.",
        "inputSchema": {
            "type": "object",
            "properties": {"task_id": {"type": "integer"}},
            "required": ["task_id"],
        },
        "annotations": {"destructiveHint": True},
    },
    {
        "name": "list_team_pool",
        "title": "팀 할 일 풀",
        "description": "팀원 누구나 가져갈 수 있는, 아직 아무도 가져가지 않은 팀 할 일 목록.",
        "inputSchema": {"type": "object", "properties": {}},
        "annotations": {"readOnlyHint": True},
    },
    {
        "name": "add_team_tasks",
        "title": "팀 할 일 추가",
        "description": "팀 할 일 풀에 할 일을 추가한다. 사용자가 팀 할 일이라고 할 때만 쓴다.",
        "inputSchema": {
            "type": "object",
            "properties": {"titles": _TITLES},
            "required": ["titles"],
        },
    },
]


class ToolError(Exception):
    """A failure to report back to Claude as a tool result (isError), not a protocol error."""


def _line(task: TaskOut) -> str:
    return f"#{task.id} [{STATUS_LABEL.get(task.status, task.status)}] {task.title}"


def _section(label: str, tasks: list[TaskOut]) -> str:
    if not tasks:
        return f"{label}: (없음)"
    return f"{label}:\n" + "\n".join(f"- {_line(t)}" for t in tasks)


def _list_tasks(args: dict, user: User, db: Session) -> str:
    scope = args.get("scope", "both")
    if scope not in ("today", "week", "both"):
        raise ToolError("scope는 today, week, both 중 하나여야 합니다")
    scopes = ["today", "week"] if scope == "both" else [scope]
    return "\n\n".join(
        _section(SCOPE_LABEL[s], tasks_api.list_tasks(scope=s, view="own", user=user, db=db)) for s in scopes
    )


def _add_tasks(args: dict, user: User, db: Session) -> str:
    scope = args.get("scope", "today")
    # Validate every title first so a bad one doesn't leave the rest half-added.
    payloads = [TaskCreate(title=title, scope=scope) for title in _titles(args)]
    created = [tasks_api.create_task(p, user=user, db=db) for p in payloads]
    return f"{SCOPE_LABEL[scope]} 칸에 {len(created)}개 추가했습니다.\n" + "\n".join(f"- {_line(t)}" for t in created)


def _update_task(args: dict, user: User, db: Session) -> str:
    fields = {k: args[k] for k in ("title", "status", "scope") if args.get(k) is not None}
    if not fields:
        raise ToolError("바꿀 항목(title, status, scope)을 하나 이상 넘겨야 합니다")
    task = tasks_api.update_task(_task_id(args), TaskUpdate(**fields), user=user, db=db)
    return f"수정했습니다: {_line(task)} ({SCOPE_LABEL.get(task.scope, task.scope)})"


def _delete_task(args: dict, user: User, db: Session) -> str:
    task_id = _task_id(args)
    task = tasks_api._get_owned(db, task_id, user)
    title = task.title
    tasks_api.delete_task(task_id, user=user, db=db)
    return f"삭제했습니다: #{task_id} {title}"


def _list_team_pool(args: dict, user: User, db: Session) -> str:
    if not user.team_id:
        raise ToolError("팀에 소속되어 있지 않습니다")
    return _section(SCOPE_LABEL["team"], tasks_api.list_team_pool(user=user, db=db))


def _add_team_tasks(args: dict, user: User, db: Session) -> str:
    payloads = [TeamTaskCreate(title=title) for title in _titles(args)]
    created = [tasks_api.create_team_task(p, user=user, db=db) for p in payloads]
    return f"팀 할 일 풀에 {len(created)}개 추가했습니다.\n" + "\n".join(f"- {_line(t)}" for t in created)


def _titles(args: dict) -> list[str]:
    titles = args.get("titles")
    if isinstance(titles, str):  # tolerate a single title passed bare
        titles = [titles]
    if not isinstance(titles, list) or not titles:
        raise ToolError("titles에 할 일 제목을 하나 이상 넘겨야 합니다")
    return [str(t).strip() for t in titles]


def _task_id(args: dict) -> int:
    try:
        return int(args["task_id"])
    except (KeyError, TypeError, ValueError):
        raise ToolError("task_id(정수)가 필요합니다") from None


HANDLERS: dict[str, Callable[[dict, User, Session], str]] = {
    "list_tasks": _list_tasks,
    "add_tasks": _add_tasks,
    "update_task": _update_task,
    "delete_task": _delete_task,
    "list_team_pool": _list_team_pool,
    "add_team_tasks": _add_team_tasks,
}


def _call_tool(params: dict, user: User, db: Session) -> dict:
    name = params.get("name")
    handler = HANDLERS.get(name)
    if handler is None:
        raise _RpcError(-32602, f"Unknown tool: {name}")
    try:
        text = handler(params.get("arguments") or {}, user, db)
        is_error = False
    except ToolError as exc:
        text, is_error = str(exc), True
    except HTTPException as exc:
        db.rollback()
        text, is_error = str(exc.detail), True
    except ValidationError as exc:
        db.rollback()
        text = "잘못된 입력: " + "; ".join(f"{'.'.join(map(str, e['loc']))}: {e['msg']}" for e in exc.errors())
        is_error = True
    return {"content": [{"type": "text", "text": text}], "isError": is_error}


class _RpcError(Exception):
    def __init__(self, code: int, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def _dispatch(method: str, params: dict, user: User, db: Session) -> dict:
    if method == "initialize":
        requested = params.get("protocolVersion")
        version = requested if requested in SUPPORTED_PROTOCOL_VERSIONS else SUPPORTED_PROTOCOL_VERSIONS[0]
        return {
            "protocolVersion": version,
            "capabilities": {"tools": {"listChanged": False}},
            "serverInfo": SERVER_INFO,
            "instructions": INSTRUCTIONS,
        }
    if method == "ping":
        return {}
    if method == "tools/list":
        return {"tools": TOOLS}
    if method == "tools/call":
        return _call_tool(params, user, db)
    raise _RpcError(-32601, f"Method not found: {method}")


def _handle(message: Any, user: User, db: Session) -> dict | None:
    """Answer one JSON-RPC message; None for notifications and client responses."""
    if not isinstance(message, dict) or message.get("jsonrpc") != "2.0":
        return {"jsonrpc": "2.0", "id": None, "error": {"code": -32600, "message": "Invalid Request"}}
    if "method" not in message or "id" not in message:
        return None
    msg_id = message["id"]
    try:
        result = _dispatch(message["method"], message.get("params") or {}, user, db)
    except _RpcError as exc:
        return {"jsonrpc": "2.0", "id": msg_id, "error": {"code": exc.code, "message": exc.message}}
    return {"jsonrpc": "2.0", "id": msg_id, "result": result}


@router.post("")
def mcp_endpoint(body: Any = Body(...), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if isinstance(body, list):
        replies = [r for r in (_handle(m, user, db) for m in body) if r is not None]
        return JSONResponse(replies) if replies else Response(status_code=202)
    reply = _handle(body, user, db)
    return JSONResponse(reply) if reply is not None else Response(status_code=202)


@router.get("")
def mcp_stream_not_supported():
    """No server-initiated stream: this server only answers requests."""
    return Response(status_code=405, headers={"Allow": "POST"})


@router.delete("")
def mcp_session_end():
    """Stateless server — there's no session to end."""
    return Response(status_code=405, headers={"Allow": "POST"})
