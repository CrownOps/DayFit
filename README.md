# DayFit

> Fit your day, find your rhythm.

CrownOps 팀 전용 통합 **일정·습관·타임테이블·팀 스니펫** 관리 PWA. 하루 흐름을 한 화면에서 보고, 일정·습관 알림을 이 앱 하나(웹 푸시)로 통합한다.

- Google Calendar를 일정의 진실 공급원으로 사용 (읽기/쓰기 동기화, 캘린더 자체 알림은 끔)
- 습관 등록·체크·연속기록(streak)·월간 완료율
- GCS Pulse API 연동 데일리 스니펫 + 깃허브식 잔디 히트맵 + 팀 헬스체크
- 일일 LLM 토큰 사용량(GCS Pulse 쿼터 + 수동 입력)
- 자체 VAPID 웹 푸시(PC/모바일), 설치형 PWA
- 홈 대시보드(위젯) + 오늘/이번 주 할 일(To-Do)
- 회원가입은 관리자 초대 코드 방식

## 스택

| 영역 | 기술 |
|---|---|
| 프론트엔드 | Next.js 16 (App Router, Turbopack), React 19, Tailwind v4, PWA |
| 백엔드 | FastAPI, SQLAlchemy 2, Alembic, APScheduler |
| DB | PostgreSQL (로컬은 Docker Compose) |
| 인증 | JWT + 초대 코드 / Google OAuth 2.0 (Calendar) |
| 알림 | Web Push (자체 VAPID, `pywebpush`) |
| 외부 연동 | Google Calendar API, GCS Pulse API |

## 프로젝트 구조

```
backend/    FastAPI 앱 (app/), Alembic 마이그레이션, docker-compose(postgres)
frontend/   Next.js PWA (app/, components/, lib/)
docs/       요구사항 정의서, UI 디자인 가이드, Google Calendar 연동 가이드, 로고
```

## 로컬 실행

### 1. 백엔드

```bash
cd backend
cp .env.example .env          # 값 채우기 (아래 참고)
docker compose up -d          # postgres 기동
python -m venv venv
venv/Scripts/pip install -r requirements.txt   # (POSIX: venv/bin/pip)
venv/Scripts/alembic upgrade head
venv/Scripts/python -m uvicorn app.main:app --port 8000
```

최초 관리자 계정 시딩:

```bash
venv/Scripts/python scripts/seed_admin.py <email> <password>
```

### 백엔드 테스트

```bash
cd backend
venv/Scripts/pip install -r requirements-dev.txt
venv/Scripts/python -m pytest
```

인메모리 SQLite로 돌기 때문에 Postgres도, 외부 API 토큰도 필요 없다. Google/GCS
Pulse 호출은 페이크로 대체되며, "요청이 몇 번 나갔는지"까지 검증한다.

### 2. 프론트엔드

```bash
cd frontend
cp .env.example .env.local     # NEXT_PUBLIC_VAPID_PUBLIC_KEY = 백엔드 VAPID 공개키
npm install
npm run dev                    # http://localhost:3000
```

## 환경 변수 (backend/.env)

`.env.example` 참고. 핵심 값:

- `SECRET_KEY`, `ENCRYPTION_KEY` — JWT 서명 / 비밀 암호화(Fernet). 실제 배포 시 새로 생성.
- `DATABASE_URL` — 예: `postgresql+psycopg://dayfit:dayfit@localhost:5432/dayfit`
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — [docs/Google_Calendar_연동_가이드.md](docs/Google_Calendar_연동_가이드.md) 참고
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` — 웹 푸시 키 (`web-push generate-vapid-keys`)
- `GCS_PULSE_BASE_URL`, `GCS_PULSE_TEAM_ID` — GCS Pulse 팀 스코프
- `ANTHROPIC_API_KEY` — (선택) Claude 연동. 모델은 `ANTHROPIC_MODEL`(기본 `claude-opus-5`).
  - GCS Pulse의 AI 제안·채점이 실패하면 자체 Claude 호출로 **폴백**한다. 비워 두면 폴백 없이 지금까지와 동일.
  - 이메일 페이지의 **AI 요약·할 일 추출**은 상류 경로가 없어 이 키가 있어야만 동작한다.

> ⚠️ `.env`, VAPID 개인키 등 비밀정보는 커밋하지 않는다 (`.gitignore` 적용됨).

## 문서

- [요구사항 정의서](docs/요구사항정의서_일정습관관리도구.md)
- [UI 디자인 가이드](docs/UI_디자인가이드.md)
- [Google Calendar 연동 가이드](docs/Google_Calendar_연동_가이드.md)
