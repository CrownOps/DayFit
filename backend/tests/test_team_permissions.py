"""팀룰 / 비전·미션의 수정 권한 정책."""
import pytest


@pytest.fixture
def admin(make_user):
    return make_user(is_admin=True)


@pytest.fixture
def member(make_user):
    return make_user(is_admin=False)


def _set_policy(client, login, admin, **policies):
    login(admin)
    response = client.put("/api/team/permissions", json=policies)
    assert response.status_code == 200, response.text
    return response.json()


def test_defaults_to_admin_only(client, login, admin, member):
    login(admin)
    assert client.get("/api/team/permissions").json() == {
        "rules_edit_policy": "admin",
        "profile_edit_policy": "admin",
        "can_edit_rules": True,
        "can_edit_profile": True,
        "is_admin": True,
    }

    login(member)
    body = client.get("/api/team/permissions").json()
    assert body["can_edit_rules"] is False
    assert body["can_edit_profile"] is False


def test_member_cannot_edit_under_default_policy(client, login, admin, member):
    login(member)

    created = client.post("/api/team/rules", json={"content": "규칙"})
    assert created.status_code == 403
    assert "관리자만" in created.json()["detail"]

    profile = client.put("/api/team/profile", json={"vision": "v", "mission": "m"})
    assert profile.status_code == 403


def test_opening_rules_to_the_team_lets_a_member_edit(client, login, admin, member):
    _set_policy(client, login, admin, rules_edit_policy="member")

    login(member)
    created = client.post("/api/team/rules", json={"content": "팀원이 추가한 규칙"})
    assert created.status_code == 200, created.text
    rule_id = created.json()["id"]

    updated = client.patch(f"/api/team/rules/{rule_id}", json={"content": "수정"})
    assert updated.status_code == 200
    assert client.delete(f"/api/team/rules/{rule_id}").status_code == 204


def test_rules_policy_does_not_open_vision_and_mission(client, login, admin, member):
    """권한은 항목별로 따로 움직여야 한다."""
    _set_policy(client, login, admin, rules_edit_policy="member")

    login(member)
    body = client.get("/api/team/permissions").json()
    assert body["can_edit_rules"] is True
    assert body["can_edit_profile"] is False
    assert client.put("/api/team/profile", json={"vision": "v", "mission": "m"}).status_code == 403


def test_policy_can_be_closed_again(client, login, admin, member):
    _set_policy(client, login, admin, rules_edit_policy="member")
    _set_policy(client, login, admin, rules_edit_policy="admin")

    login(member)
    assert client.post("/api/team/rules", json={"content": "규칙"}).status_code == 403


def test_admin_can_always_edit(client, login, admin):
    login(admin)
    assert client.post("/api/team/rules", json={"content": "규칙"}).status_code == 200
    assert client.put("/api/team/profile", json={"vision": "v", "mission": "m"}).status_code == 200


def test_member_cannot_change_the_policy(client, login, member):
    login(member)
    response = client.put("/api/team/permissions", json={"rules_edit_policy": "member"})
    assert response.status_code == 403


def test_rules_are_scoped_to_the_team(client, login, admin, make_user):
    login(admin)
    rule_id = client.post("/api/team/rules", json={"content": "우리 팀 규칙"}).json()["id"]

    outsider = make_user(is_admin=True, team_id="OTHER_TEAM")
    login(outsider)
    assert client.get("/api/team/rules").json() == []
    assert client.patch(f"/api/team/rules/{rule_id}", json={"content": "탈취"}).status_code == 404
    assert client.delete(f"/api/team/rules/{rule_id}").status_code == 404
