"""Claude가 대화로 할 일을 넣을 수 있게 하는 MCP 엔드포인트와 개인 API 토큰.

여기서는 `get_current_user`를 갈아끼우지 않는다 — 토큰 인증 자체가 검증 대상이다.
"""
from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.core.database import get_db
from app.core.security import create_access_token
from app.main import app
from app.models.api_token import ApiToken
from app.models.task import Task

MCP_HEADERS = {"Accept": "application/json, text/event-stream"}


@pytest.fixture
def raw_client(db):
    """DB만 테스트용으로 바꾸고 인증은 실제 경로를 타는 클라이언트."""
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def user(make_user):
    return make_user()


@pytest.fixture
def api_token(raw_client, user):
    """웹 로그인(JWT)으로 개인 토큰을 발급받는다 — 설정 화면이 하는 그대로."""
    jwt = create_access_token(subject=user.email)
    res = raw_client.post(
        "/api/auth/api-tokens", json={"name": "Claude"}, headers={"Authorization": f"Bearer {jwt}"}
    )
    assert res.status_code == 200, res.text
    return res.json()["token"]


def rpc(client, token, method, params=None, msg_id=1):
    body = {"jsonrpc": "2.0", "id": msg_id, "method": method}
    if params is not None:
        body["params"] = params
    return client.post("/api/mcp", json=body, headers={**MCP_HEADERS, "Authorization": f"Bearer {token}"})


def call(client, token, name, arguments=None):
    res = rpc(client, token, "tools/call", {"name": name, "arguments": arguments or {}})
    assert res.status_code == 200, res.text
    return res.json()["result"]


# ---- 개인 API 토큰 -------------------------------------------------------------


def test_token_is_stored_hashed_and_shown_once(raw_client, db, user, api_token):
    assert api_token.startswith("dft_")
    stored = db.query(ApiToken).one()
    assert stored.token_hash != api_token
    assert api_token not in stored.token_hash

    jwt = create_access_token(subject=user.email)
    listed = raw_client.get("/api/auth/api-tokens", headers={"Authorization": f"Bearer {jwt}"}).json()
    assert [t["name"] for t in listed] == ["Claude"]
    assert "token" not in listed[0]


def test_api_token_authenticates_regular_routes(raw_client, user, api_token):
    res = raw_client.get("/api/auth/me", headers={"Authorization": f"Bearer {api_token}"})
    assert res.status_code == 200
    assert res.json()["email"] == user.email


def test_revoked_token_stops_working(raw_client, user, api_token, db):
    jwt = create_access_token(subject=user.email)
    token_id = db.query(ApiToken).one().id
    assert raw_client.delete(f"/api/auth/api-tokens/{token_id}", headers={"Authorization": f"Bearer {jwt}"}).status_code == 204

    res = raw_client.get("/api/auth/me", headers={"Authorization": f"Bearer {api_token}"})
    assert res.status_code == 401


def test_cannot_revoke_someone_elses_token(raw_client, make_user, api_token, db):
    other = make_user()
    jwt = create_access_token(subject=other.email)
    token_id = db.query(ApiToken).one().id
    res = raw_client.delete(f"/api/auth/api-tokens/{token_id}", headers={"Authorization": f"Bearer {jwt}"})
    assert res.status_code == 404


def test_last_used_is_not_rewritten_on_every_request(raw_client, api_token, db):
    raw_client.get("/api/auth/me", headers={"Authorization": f"Bearer {api_token}"})
    db.expire_all()
    first = db.query(ApiToken).one().last_used_at
    assert first is not None

    raw_client.get("/api/auth/me", headers={"Authorization": f"Bearer {api_token}"})
    db.expire_all()
    assert db.query(ApiToken).one().last_used_at == first


# ---- MCP 프로토콜 ---------------------------------------------------------------


def test_mcp_requires_auth(raw_client):
    res = raw_client.post("/api/mcp", json={"jsonrpc": "2.0", "id": 1, "method": "ping"}, headers=MCP_HEADERS)
    assert res.status_code == 401


def test_initialize_handshake(raw_client, api_token):
    res = rpc(raw_client, api_token, "initialize", {
        "protocolVersion": "2025-06-18",
        "capabilities": {},
        "clientInfo": {"name": "claude-code", "version": "test"},
    })
    result = res.json()["result"]
    assert result["protocolVersion"] == "2025-06-18"
    assert "tools" in result["capabilities"]
    assert result["serverInfo"]["name"] == "dayfit"

    notified = raw_client.post(
        "/api/mcp",
        json={"jsonrpc": "2.0", "method": "notifications/initialized"},
        headers={**MCP_HEADERS, "Authorization": f"Bearer {api_token}"},
    )
    assert notified.status_code == 202


def test_unknown_protocol_version_falls_back_to_latest(raw_client, api_token):
    result = rpc(raw_client, api_token, "initialize", {"protocolVersion": "1999-01-01"}).json()["result"]
    assert result["protocolVersion"] == "2025-06-18"


def test_tools_list(raw_client, api_token):
    tools = rpc(raw_client, api_token, "tools/list").json()["result"]["tools"]
    assert {t["name"] for t in tools} == {
        "list_tasks", "add_tasks", "update_task", "delete_task", "list_team_pool", "add_team_tasks",
    }


def test_unknown_method(raw_client, api_token):
    assert rpc(raw_client, api_token, "resources/list").json()["error"]["code"] == -32601


def test_get_is_not_supported(raw_client, api_token):
    res = raw_client.get("/api/mcp", headers={"Authorization": f"Bearer {api_token}"})
    assert res.status_code == 405


# ---- 도구 ----------------------------------------------------------------------


def test_add_tasks_lands_in_the_right_column(raw_client, api_token, db, user):
    result = call(raw_client, api_token, "add_tasks", {"titles": ["보고서 초안", "치과 예약"]})
    assert not result["isError"]
    assert "2개 추가" in result["content"][0]["text"]

    call(raw_client, api_token, "add_tasks", {"titles": ["주간 회고"], "scope": "week"})

    rows = db.query(Task).filter(Task.user_id == user.id).order_by(Task.id).all()
    assert [(t.title, t.scope) for t in rows] == [
        ("보고서 초안", "today"), ("치과 예약", "today"), ("주간 회고", "week"),
    ]
    assert rows[0].anchor_date == date.today()
    assert rows[0].sort_order < rows[1].sort_order


def test_add_tasks_is_all_or_nothing(raw_client, api_token, db):
    result = call(raw_client, api_token, "add_tasks", {"titles": ["괜찮은 제목", "x" * 501]})
    assert result["isError"]
    assert db.query(Task).count() == 0


def test_list_update_delete_roundtrip(raw_client, api_token, db):
    call(raw_client, api_token, "add_tasks", {"titles": ["장보기"]})
    task_id = db.query(Task).one().id

    listing = call(raw_client, api_token, "list_tasks")["content"][0]["text"]
    assert f"#{task_id} [할 일] 장보기" in listing
    assert "이번 주: (없음)" in listing

    updated = call(raw_client, api_token, "update_task", {"task_id": task_id, "status": "done"})
    assert not updated["isError"]
    db.expire_all()
    task = db.get(Task, task_id)
    assert task.status == "done" and task.completed

    moved = call(raw_client, api_token, "update_task", {"task_id": task_id, "scope": "week"})
    assert "이번 주" in moved["content"][0]["text"]

    deleted = call(raw_client, api_token, "delete_task", {"task_id": task_id})
    assert not deleted["isError"]
    assert db.query(Task).count() == 0


def test_cannot_touch_another_users_task(raw_client, api_token, make_user, db):
    other = make_user()
    task = Task(user_id=other.id, title="남의 할 일", scope="today", anchor_date=date.today())
    db.add(task)
    db.commit()

    for name, args in [
        ("update_task", {"task_id": task.id, "status": "done"}),
        ("delete_task", {"task_id": task.id}),
    ]:
        result = call(raw_client, api_token, name, args)
        assert result["isError"]
    db.expire_all()
    assert db.get(Task, task.id).status == "todo"


def test_update_without_fields_is_a_tool_error(raw_client, api_token):
    result = call(raw_client, api_token, "update_task", {"task_id": 1})
    assert result["isError"]


def test_team_pool(raw_client, api_token, db):
    call(raw_client, api_token, "add_team_tasks", {"titles": ["배포 체크리스트 정리"]})
    pool = db.query(Task).one()
    assert pool.user_id is None and pool.scope == "team"

    listing = call(raw_client, api_token, "list_team_pool")["content"][0]["text"]
    assert "배포 체크리스트 정리" in listing


def test_team_pool_without_team(raw_client, make_user):
    loner = make_user(team_id="")
    jwt = create_access_token(subject=loner.email)
    token = raw_client.post(
        "/api/auth/api-tokens", json={"name": "c"}, headers={"Authorization": f"Bearer {jwt}"}
    ).json()["token"]
    result = call(raw_client, token, "add_team_tasks", {"titles": ["x"]})
    assert result["isError"]
