"""메일 요약 · 할 일 추출.

스니펫 쪽과 달리 상류(GCS Pulse) 경로가 없어서 Claude가 유일한 수단이다.
키가 없으면 폴백이 아니라 기능 자체를 쓸 수 없으므로, 조용히 넘어가지 않고
그렇게 알려야 한다.
"""
import anthropic
import httpx2
import pytest

from app.api import gmail as gmail_api
from app.services import llm
from app.services.gmail_service import GmailError

MESSAGE = {
    "id": "m1",
    "thread_id": "t1",
    "subject": "스프린트 리뷰 일정",
    "from_": "pm@example.com",
    "to_": "me@example.com",
    "snippet": "금요일까지 회신 부탁드립니다",
    "date": "2026-08-26T09:00:00+00:00",
    "unread": True,
    "body_text": "안녕하세요.\n금요일 15시 스프린트 리뷰 참석 여부를 회신해 주세요.\n감사합니다.",
}


@pytest.fixture
def member(make_user, login):
    return login(make_user(gmail_connected=True))


@pytest.fixture
def gmail(monkeypatch):
    state = {"message": MESSAGE}

    def get_message(user, db, message_id):
        value = state["message"]
        if isinstance(value, Exception):
            raise value
        return value

    monkeypatch.setattr(gmail_api.gmail_service, "get_message", get_message)
    return state


@pytest.fixture
def claude(monkeypatch):
    """구조화된 출력을 돌려주는 목 트랜스포트."""
    state = {
        "summary": "금요일 15시 스프린트 리뷰 참석 여부를 회신해야 한다.",
        "action_items": ["금요일 15시 리뷰 참석 여부 회신하기"],
        "configured": True,
        "sent": [],
    }

    def handler(request: httpx2.Request) -> httpx2.Response:
        state["sent"].append(request)
        if isinstance(state.get("http_status"), int):
            return httpx2.Response(state["http_status"], json={"error": {"message": "nope"}})
        payload = {
            "id": "msg_test",
            "type": "message",
            "role": "assistant",
            "model": "claude-opus-5",
            "content": [
                {
                    "type": "text",
                    "text": (
                        '{"summary": %s, "action_items": %s}'
                        % (
                            __import__("json").dumps(state["summary"], ensure_ascii=False),
                            __import__("json").dumps(state["action_items"], ensure_ascii=False),
                        )
                    ),
                }
            ],
            "stop_reason": state.get("stop_reason", "end_turn"),
            "stop_sequence": None,
            "usage": {"input_tokens": 10, "output_tokens": 20},
        }
        return httpx2.Response(200, json=payload)

    client = anthropic.Anthropic(
        api_key="test-key",
        max_retries=0,
        http_client=anthropic.DefaultHttpxClient(transport=httpx2.MockTransport(handler)),
    )
    monkeypatch.setattr(llm, "_get_client", lambda: client)
    monkeypatch.setattr(llm, "is_configured", lambda: state["configured"])
    return state


def _brief(client, expect=200):
    response = client.post("/api/gmail/messages/m1/brief")
    assert response.status_code == expect, response.text
    return response.json()


def test_summarises_and_extracts_action_items(client, gmail, claude, member):
    body = _brief(client)

    assert body["summary"] == claude["summary"]
    assert body["action_items"] == ["금요일 15시 리뷰 참석 여부 회신하기"]


def test_sends_the_subject_sender_and_body_to_claude(client, gmail, claude, member):
    import json

    _brief(client)

    sent = json.loads(claude["sent"][0].content)
    content = sent["messages"][0]["content"]
    assert "스프린트 리뷰 일정" in content, "제목이 들어가야 한다"
    assert "pm@example.com" in content, "보낸사람이 들어가야 한다"
    assert "참석 여부를 회신해" in content, "본문이 들어가야 한다"
    # SDK는 `output_format=<Pydantic 모델>`을 와이어에서 output_config.format으로 보낸다.
    fmt = sent["output_config"]["format"]
    assert fmt["type"] == "json_schema", "구조화된 출력을 써야 한다"
    assert sorted(fmt["schema"]["required"]) == ["action_items", "summary"]


def test_a_newsletter_yields_no_action_items(client, gmail, claude, member):
    claude["action_items"] = []

    assert _brief(client)["action_items"] == []


def test_blank_action_items_are_dropped(client, gmail, claude, member):
    """빈 문자열이 그대로 오면 UI에 빈 줄이 생긴다."""
    claude["action_items"] = ["회신하기", "   ", ""]

    assert _brief(client)["action_items"] == ["회신하기"]


def test_without_an_api_key_the_feature_says_so(client, gmail, claude, member):
    claude["configured"] = False

    response = client.post("/api/gmail/messages/m1/brief")

    assert response.status_code == 400
    assert "ANTHROPIC_API_KEY" in response.json()["detail"]


def test_disconnected_mailbox_is_reported(client, gmail, claude, make_user, login):
    login(make_user(gmail_connected=False))

    response = client.post("/api/gmail/messages/m1/brief")

    assert response.status_code == 400
    assert "연결" in response.json()["detail"]


def test_gmail_failure_is_passed_through(client, gmail, claude, member):
    gmail["message"] = GmailError(400, "Gmail 권한이 없습니다. 설정에서 이메일을 다시 연결하세요.")

    response = client.post("/api/gmail/messages/m1/brief")

    assert response.status_code == 400
    assert "Gmail 권한이 없습니다" in response.json()["detail"]


def test_a_body_less_mail_falls_back_to_the_snippet(client, gmail, claude, member):
    gmail["message"] = {**MESSAGE, "body_text": ""}

    assert _brief(client)["summary"] == claude["summary"]


def test_a_mail_with_nothing_to_read_is_rejected(client, gmail, claude, member):
    gmail["message"] = {**MESSAGE, "body_text": "", "snippet": "  "}

    response = client.post("/api/gmail/messages/m1/brief")

    assert response.status_code == 400
    assert "본문이 없는" in response.json()["detail"]


def test_a_claude_failure_becomes_a_readable_error(client, gmail, claude, member):
    claude["http_status"] = 500

    response = client.post("/api/gmail/messages/m1/brief")

    assert response.status_code == 502
    assert "Claude" in response.json()["detail"]


def test_a_refusal_does_not_look_like_a_summary(client, gmail, claude, member):
    claude["stop_reason"] = "refusal"

    response = client.post("/api/gmail/messages/m1/brief")

    assert response.status_code == 502


def test_an_overlong_mail_is_refused_not_truncated(client, gmail, claude, member):
    """조용히 잘라내면 사용자는 잘린 줄 모르고 요약을 믿는다."""
    gmail["message"] = {**MESSAGE, "body_text": "가" * (llm._MAX_EMAIL_CHARS + 1)}

    response = client.post("/api/gmail/messages/m1/brief")

    assert response.status_code == 502
    assert "너무 길어" in response.json()["detail"]
    assert claude["sent"] == [], "요청을 보내지 않아야 한다"
