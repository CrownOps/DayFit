"""읽기 요청이 조용한지.

두 경로가 읽기만 하면 되는데도 매번 DB에 썼다. 하나는 Google 토큰 재저장,
다른 하나는 오늘 할 일 롤오버다. 둘 다 홈 화면과 일정·할 일 페이지의 핫 패스라
vCPU 하나짜리 인스턴스에서는 그냥 낭비다.
"""
from datetime import date, time, timedelta

import pytest
from sqlalchemy import event

from app.api import tasks as tasks_api
from app.core.security import encrypt_secret
from app.models.task import Task
from app.services import google_calendar as gcal


class WriteCounter:
    """세션이 실제로 내보낸 쓰기 구문을 센다."""

    def __init__(self, session):
        self.connection = session.get_bind()
        self.statements: list[str] = []

    def __enter__(self):
        event.listen(self.connection, "before_cursor_execute", self._record)
        return self

    def __exit__(self, *exc_info):
        event.remove(self.connection, "before_cursor_execute", self._record)
        return False

    def _record(self, conn, cursor, statement, parameters, context, executemany):
        head = statement.lstrip().split(None, 1)[0].upper() if statement.strip() else ""
        if head in {"INSERT", "UPDATE", "DELETE"}:
            self.statements.append(statement.strip().split("\n")[0])

    @property
    def count(self) -> int:
        return len(self.statements)


# ---- A5: Google 토큰 ---------------------------------------------------------


@pytest.fixture
def google_user(make_user, monkeypatch):
    """Google 클라이언트와 토큰이 갖춰진 사용자."""

    def fake_refresh(self, request):
        self.token = "fresh-access-token"

    monkeypatch.setattr(gcal.Credentials, "refresh", fake_refresh)
    monkeypatch.setattr(gcal, "Request", lambda: None)

    return make_user(
        google_client_id="client-id",
        google_client_secret_encrypted=encrypt_secret("client-secret"),
        google_refresh_token_encrypted=encrypt_secret("refresh-token"),
        google_oauth_token_encrypted=encrypt_secret("stored-access-token"),
        google_calendar_connected=True,
    )


def test_unchanged_token_is_not_rewritten(db, google_user):
    """유효한 토큰을 다시 저장할 이유가 없다.

    Fernet은 같은 값을 암호화해도 매번 다른 바이트가 나오므로, 암호문을 비교해서는
    '바뀌지 않았다'를 판단할 수 없다 — 평문을 비교해야 한다.
    """
    with WriteCounter(db) as writes:
        gcal.get_google_credentials(google_user, db)
        gcal.get_google_credentials(google_user, db)

    assert writes.count == 0, f"쓰기가 발생했다: {writes.statements}"


def test_a_refreshed_token_is_stored_once(db, google_user):
    """새로 발급받은 토큰은 저장하되, 그 다음 호출은 다시 조용해야 한다."""
    google_user.google_oauth_token_encrypted = None  # 액세스 토큰 없음 → 갱신 필요
    db.commit()

    with WriteCounter(db) as writes:
        creds = gcal.get_google_credentials(google_user, db)
    assert creds.token == "fresh-access-token"
    assert writes.count == 1, f"한 번만 써야 한다: {writes.statements}"

    with WriteCounter(db) as writes:
        gcal.get_google_credentials(google_user, db)
    assert writes.count == 0, "저장된 뒤에는 조용해야 한다"


def test_the_stored_token_survives_a_round_trip(db, google_user):
    google_user.google_oauth_token_encrypted = None
    db.commit()

    gcal.get_google_credentials(google_user, db)

    db.refresh(google_user)
    creds, stored = gcal._load_credentials(
        google_user, gcal.resolve_google_config(db, google_user), gcal.CALENDAR_SCOPES
    )
    assert stored == "fresh-access-token", "다음 요청이 그대로 재사용할 수 있어야 한다"


# ---- A6: 오늘 할 일 롤오버 ---------------------------------------------------


@pytest.fixture
def member(make_user, login):
    return login(make_user())


def _task(user, *, anchor: date, status: str = "todo", title: str = "할 일") -> Task:
    return Task(
        user_id=user.id,
        title=title,
        scope="today",
        anchor_date=anchor,
        status=status,
        completed=status == "done",
        sort_order=1,
    )


def test_nothing_to_roll_over_writes_nothing(db, member):
    """대부분의 조회는 넘길 게 없다 — 그때는 UPDATE도 COMMIT도 나가면 안 된다."""
    db.add(_task(member, anchor=date.today()))
    db.commit()

    with WriteCounter(db) as writes:
        tasks_api._rollover_today_tasks(db, member)

    assert writes.count == 0, f"쓰기가 발생했다: {writes.statements}"


def test_stale_unfinished_tasks_move_to_today(db, member):
    yesterday = date.today() - timedelta(days=1)
    db.add(_task(member, anchor=yesterday, title="어제 남긴 일"))
    db.add(_task(member, anchor=yesterday, status="done", title="어제 끝낸 일"))
    db.commit()

    with WriteCounter(db) as writes:
        tasks_api._rollover_today_tasks(db, member)
    assert writes.count == 1

    moved = db.query(Task).filter(Task.title == "어제 남긴 일").one()
    finished = db.query(Task).filter(Task.title == "어제 끝낸 일").one()
    assert moved.anchor_date == date.today()
    assert finished.anchor_date == yesterday, "끝낸 일은 그날에 남는다"


def test_rolling_over_twice_only_writes_once(db, member):
    db.add(_task(member, anchor=date.today() - timedelta(days=1)))
    db.commit()

    with WriteCounter(db) as writes:
        tasks_api._rollover_today_tasks(db, member)
        tasks_api._rollover_today_tasks(db, member)

    assert writes.count == 1, "두 번째 호출은 넘길 게 없다"


def test_another_users_stale_tasks_are_left_alone(db, member, make_user):
    other = make_user()
    yesterday = date.today() - timedelta(days=1)
    db.add(_task(other, anchor=yesterday, title="남의 일"))
    db.commit()

    with WriteCounter(db) as writes:
        tasks_api._rollover_today_tasks(db, member)

    assert writes.count == 0
    assert db.query(Task).filter(Task.title == "남의 일").one().anchor_date == yesterday


def test_listing_today_still_rolls_over(client, db, member):
    """엔드포인트를 통해서도 동작이 유지되는지."""
    db.add(_task(member, anchor=date.today() - timedelta(days=1), title="어제 남긴 일"))
    db.commit()

    body = client.get("/api/tasks", params={"scope": "today", "view": "own"}).json()

    assert [t["title"] for t in body] == ["어제 남긴 일"]
