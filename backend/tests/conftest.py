"""공통 픽스처.

앱 설정(`app.core.config.Settings`)은 import 시점에 환경변수를 읽으므로,
`app.*`를 처음 import하기 전에 환경을 먼저 세팅해야 한다. pytest는 conftest를
테스트 모듈보다 먼저 import하므로 여기 모듈 최상단이 그 자리다.
"""
import os

from cryptography.fernet import Fernet

os.environ.setdefault("SECRET_KEY", "test-secret-key")
os.environ.setdefault("ENCRYPTION_KEY", Fernet.generate_key().decode())
os.environ.setdefault("GCS_PULSE_TEAM_ID", "TEST_TEAM")
# 실수로라도 실제 DB를 건드리지 않도록 항상 덮어쓴다.
os.environ["DATABASE_URL"] = "sqlite+pysqlite:///:memory:"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app import models  # noqa: E402,F401  (모든 매퍼 등록 → create_all)
from app.core.database import Base, get_db  # noqa: E402
from app.core.deps import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.user import User  # noqa: E402

TEAM_ID = "TEST_TEAM"


@pytest.fixture
def db():
    """테스트마다 새 인메모리 SQLite.

    StaticPool로 커넥션을 하나만 유지해야 인메모리 DB가 세션 간에 살아남는다.
    """
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@pytest.fixture
def make_user(db):
    """팀에 소속된 사용자를 만든다."""
    counter = {"n": 0}

    def _make(*, is_admin: bool = False, team_id: str = TEAM_ID, **kwargs) -> User:
        counter["n"] += 1
        email = kwargs.pop("email", f"user{counter['n']}@example.com")
        user = User(
            email=email,
            name=kwargs.pop("name", f"사용자{counter['n']}"),
            password_hash="not-a-real-hash",
            is_admin=is_admin,
            team_id=team_id,
            **kwargs,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user

    return _make


@pytest.fixture
def _auth_state():
    return {}


@pytest.fixture
def client(db, _auth_state):
    """인증된 TestClient. 어느 사용자로 볼지는 `login` 픽스처로 정한다.

    `get_current_user`만 갈아끼우면 그것에 의존하는 `get_current_admin`도 함께
    올바르게 동작한다(FastAPI가 하위 의존성까지 override를 통해 해석한다).
    """

    def _current_user():
        user = _auth_state.get("user")
        assert user is not None, "테스트에서 login(user)를 먼저 호출해야 합니다"
        return user

    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = _current_user
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def login(_auth_state):
    def _login(user: User) -> User:
        _auth_state["user"] = user
        return user

    return _login
