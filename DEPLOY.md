# DayFit 배포 가이드 (Railway)

Postgres + 백엔드(FastAPI) + 프론트(Next.js)를 Railway 프로젝트 한 곳에 올린다.
백엔드는 **상시 구동**이어야 한다(APScheduler 웹푸시 알림). 그래서 잠드는 무료 티어(Render free 등)는 부적합.

## 구성

| 서비스 | 빌더 | 루트 디렉터리 | 도메인 |
|---|---|---|---|
| Postgres | Railway 플러그인 | — | 내부 전용 |
| `dayfit-api` | Dockerfile | `backend/` | 공개 (프론트가 브라우저에서 직접 호출) |
| `dayfit-web` | Nixpacks | `frontend/` | 공개 (사용자 접속) |

프론트는 브라우저에서 `NEXT_PUBLIC_API_BASE`(백엔드 공개 URL)로 직접 호출하므로,
백엔드 도메인이 정해진 뒤 그 값을 프론트 빌드 변수에 넣고 재빌드해야 한다.

## 배포 순서

### 0. 사전 준비
- Railway 계정 + `railway` CLI 로그인: `npm i -g @railway/cli && railway login`
- 프로덕션 시크릿 생성 (아래 참고)

### 1. 프로젝트 + Postgres
```bash
railway init            # 새 프로젝트 생성
railway add --database postgres
```

### 2. 백엔드 서비스 (`backend/` 루트)
- 서비스 루트 디렉터리를 `backend/`로 지정 (Dockerfile 자동 감지).
- 변수 설정 (아래 "백엔드 환경변수").
- Postgres 참조 변수 연결: `DATABASE_URL`을 Railway Postgres의 연결 문자열로.
  ⚠️ Railway가 주는 URL은 `postgresql://...` 형식 → 앱은 `postgresql+psycopg://...`를 기대.
  변수값 앞부분을 `postgresql+psycopg://`로 바꿔서 넣는다.
- 배포 후 공개 도메인 생성(Settings → Networking → Generate Domain). 예: `https://dayfit-api.up.railway.app`

### 3. 프론트 서비스 (`frontend/` 루트)
- 서비스 루트 디렉터리를 `frontend/`로 지정 (Nixpacks).
- 빌드 변수:
  - `NEXT_PUBLIC_API_BASE` = 2단계에서 만든 백엔드 도메인
  - `NEXT_PUBLIC_VAPID_PUBLIC_KEY` = 백엔드 `VAPID_PUBLIC_KEY`와 동일
- 배포 후 공개 도메인 생성. 예: `https://dayfit-web.up.railway.app`

### 4. 상호 참조 마무리
- 백엔드 `FRONTEND_URL` = 프론트 도메인 (예: `https://dayfit-web-production.up.railway.app`)
  → 이 값은 OAuth 리다이렉트에도 쓰이며, **CORS 허용 origin에 자동 포함**됩니다.
  실제 배포된 프론트 URL과 정확히 일치해야 합니다(끝에 슬래시 없이).
- 백엔드 `CORS_ORIGINS` = (선택) 프론트 외에 추가로 허용할 origin이 있을 때만 콤마로 나열.
  없으면 비워둬도 `FRONTEND_URL`만으로 동작합니다.
- (구글 캘린더 쓰면) `GOOGLE_REDIRECT_URI` = `<백엔드도메인>/api/calendar/oauth/callback`
  → 이 URL을 Google Cloud Console OAuth 승인 리디렉션 URI에도 등록.
- 값 변경 후 백엔드 재배포.

### 5. 관리자 시딩
백엔드 컨테이너에서 1회:
```bash
railway run --service dayfit-api python scripts/seed_admin.py <email> <password> [gcs_token]
```
또는 Railway 대시보드의 서비스 shell에서 동일 명령.

## 백엔드 환경변수 (dayfit-api)

| 키 | 값 |
|---|---|
| `SECRET_KEY` | 새로 생성한 랜덤 (JWT 서명) |
| `ENCRYPTION_KEY` | 새로 생성한 Fernet 키 (프로덕션 DB는 새 DB이므로 새 키 OK) |
| `DATABASE_URL` | `postgresql+psycopg://...` (Railway Postgres) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | 로컬 `.env` 값 재사용 또는 `web-push generate-vapid-keys` |
| `VAPID_SUBJECT` | `mailto:eunji7480@gachon.ac.kr` |
| `FRONTEND_URL` | 프론트 도메인 (CORS origin에 자동 포함) |
| `CORS_ORIGINS` | (선택) 프론트 외 추가 origin만 콤마로 나열 |
| `GCS_PULSE_BASE_URL` | `https://api.1000.school` |
| `GCS_PULSE_TEAM_ID` | `78I8M9OE` |
| `GOOGLE_CLIENT_ID` / `SECRET` / `GOOGLE_REDIRECT_URI` | 캘린더 연동 시 |
| `ADMIN_INVITE_BOOTSTRAP_EMAIL` | (선택) |

## 프론트 환경변수 (dayfit-web)

| 키 | 값 |
|---|---|
| `NEXT_PUBLIC_API_BASE` | 백엔드 도메인 |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | 백엔드 `VAPID_PUBLIC_KEY`와 동일 |

## 시크릿 생성

```bash
# SECRET_KEY
python -c "import secrets; print(secrets.token_urlsafe(48))"
# ENCRYPTION_KEY (Fernet)
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
# VAPID (재사용 안 할 때)
npx web-push generate-vapid-keys
```

## 주의
- **replica는 1개로 유지**. 2개 이상이면 APScheduler가 중복 실행돼 알림이 두 번 발송된다.
- 마이그레이션은 백엔드 컨테이너 시작 시 `alembic upgrade head`로 자동 실행된다(Dockerfile CMD).
- `.env`/개인키는 커밋 금지. Railway 변수로만 관리.
