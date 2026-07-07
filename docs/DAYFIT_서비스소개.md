# DayFit — 서비스 소개 & 기능 명세

> **Fit your day, find your rhythm.**
> 하루의 흐름을 한 화면에서 보고, 일정·습관·팀 활동 알림을 이 앱 하나(웹 푸시)로 통합하는 CrownOps 팀 전용 PWA.

---

## 1. 서비스 개요

**DayFit**은 CrownOps 팀을 위한 **통합 일정·습관·타임테이블·팀 스니펫 관리 PWA**입니다. 흩어져 있던 캘린더 앱(목록형), 습관 앱(습관만), 시간표 앱(일정만)을 하나로 묶어, "하루를 시간 블록으로 시각화 + 습관 체크 + 팀 데일리 스니펫 + 통합 알림"까지 **한 화면·한 알림 채널**로 제공하는 것이 목표입니다.

| 항목 | 내용 |
|---|---|
| 대상 | CrownOps 팀 (현재 2인, 관리자 = 은지) — 외부 공개 아님 |
| 배포 형태 | 앱스토어 미배포. 브라우저에서 "홈 화면에 추가"로 설치하는 **설치형 웹앱(PWA)** |
| 일정 원본 | Google Calendar (읽기/쓰기 양방향 동기화, 진실 공급원) |
| 스니펫·토큰 원본 | GCS Pulse API (CrownOps `team_id` 스코프 고정) |
| 알림 | **자체 VAPID 웹 푸시** (FCM 아님) — PC·모바일(iOS 포함) 통합 |
| 회원가입 | 관리자 **초대 코드** 방식 |

### 설계 원칙
- **Google Calendar**는 일정 데이터의 진실 공급원. 앱은 캐시만 두고 재동기화한다.
- **GCS Pulse**는 데일리 스니펫·토큰 사용량 데이터의 진실 공급원. 앱은 그 위에 팀 전용 뷰(잔디 히트맵, 헬스체크)만 얹는 얇은 레이어.
- **알림만큼은 외부에 위임하지 않고 앱이 직접 책임진다.** Google Calendar 자체 알림은 끄고, 중복 없이 이 앱의 웹 푸시로만 통합한다.

---

## 2. 기능 상세

### 2.1 홈 대시보드 (`/home`) — 기본 랜딩
- 위젯 모음 형태의 대시보드가 로그인 후 첫 화면.
- **오늘 / 이번 주 할 일(To-Do)** 위젯을 중심으로 하루/주간 현황을 한눈에 확인.

### 2.2 할 일(To-Do) 관리 (`/tasks`)
- `today`(오늘) / `week`(이번 주) 두 가지 범위(scope)로 할 일 등록·체크.
- 기준 날짜(anchor_date)를 기준으로 오늘/이번 주 항목을 분리 관리.

### 2.3 일정 관리 & Google Calendar 연동 (`/today`)
- **일 / 주 / 월 3가지 모드**로 일정 조회.
- 하루를 세로 타임라인(타임테이블)으로 시각화 — 일정·습관·스니펫 작성 여부를 한 화면에 병합, 빈 시간대 강조.
- 앱에서 일정 생성/수정/삭제 시 Google Calendar에 양방향 동기화(`events.insert/patch/delete`).
- 동기화되는 이벤트는 Calendar 자체 알림을 끄고(`reminders: useDefault:false`), "N분 전 알림"은 앱의 자체 스케줄러에 등록.
- **개인별 OAuth 클라이언트 방식**: 각 사용자가 본인 Google Cloud에서 만든 `client_id/secret`을 **설정 → "Google API 연결" 카드**에 입력. 서버는 이를 Fernet으로 암호화 저장하고, 사용자별 클라이언트로 OAuth를 수행한다.

### 2.4 습관 관리 (`/habits`)
- 습관 등록(이름, 목표 시간대, 반복 주기: 매일/특정 요일).
- 설정 시각에 **웹 푸시 알림** 발송(PC + 모바일).
- 완료 체크(토글), **연속 달성일(streak)** 계산, 놓친 습관 목록, **월간 완료율** 통계.

### 2.5 데일리 스니펫 & 팀 잔디 (`/snippets`)
- 매일 짧은 일지(스니펫) 작성 — GCS Pulse `POST /daily-snippets`로 저장(자체 DB에 원본 저장 안 함).
- 팀원별 스니펫을 CrownOps `team_id` 범위로만 조회.
- **깃허브식 잔디(contribution) 히트맵** — 작성 여부를 날짜별로 시각화(개인/팀 뷰).
- AI 점수 기반 시각화로 스니펫·헬스·루틴을 재구성.

### 2.6 팀 헬스체크 (`/team`)
- 팀원들의 오늘 컨디션·헬스 상태를 한눈에 보는 대시보드.
- 팀원이 늘어도 코드 변경 없이 `team_id` 기준으로 반영되는 구조(하드코딩 없음).

### 2.7 팀 스페이스 (`/team-space`)
- 팀의 **비전(vision) / 미션(mission)** 및 **팀 규칙(rules)** 을 관리.
- 비전·미션·규칙 수정은 관리자 권한(`get_current_admin`) 필요.

### 2.8 독서 트래커 (`/reading`)
- 책을 `reading`(읽는 중) / `want`(읽고 싶은) / `done`(완료) 상태로 관리.
- 개인(own) 스코프 및 팀 공유 스코프 지원, 소유자 정보 함께 표시.

### 2.9 LLM 토큰 사용량 (`/tokens`)
- GCS Pulse `token-usage`(쿼터) 조회 + 수동 입력 병행.
- 모델별 구분, 팀 일일/주간 합산, 단가 매핑을 통한 예상 비용 환산.
> 참고: GCS Pulse의 token-usage 응답은 per-model breakdown이 아니라 **quota만** 반환하므로, 세부 사용량은 수동/보완 입력에 의존.

### 2.10 통합 알림 (웹 푸시)
- **자체 VAPID** 기반 Web Push(FCM 아님). 서비스워커로 PC·모바일에 발송.
- 한 사용자가 여러 기기(PC + 폰)를 각각 구독하면 모든 기기로 동시 발송.
- **APScheduler 1분 주기** 스케줄러가 발송 시각이 된 일정·습관 알림을 찾아 전송.
- 알림 클릭 시 해당 화면으로 딥링크 이동, 만료된 구독(410 Gone)은 자동 정리.
- ⚠️ **iOS는 "홈 화면에 추가"로 설치한 PWA 상태에서만** 푸시가 동작(애플 WebKit 정책) → 온보딩에 설치 안내 필수.

### 2.11 계정 · 온보딩 · 관리자
- **회원가입**: 관리자 초대 코드 방식. 최초 관리자는 `scripts/seed_admin.py`로 시딩.
- **온보딩(`/onboarding`)**: 팀 코드 + 본인 GCS Pulse API 토큰 등록.
- **관리자(`/admin`)**: 초대 코드 발급, 팀 프로필/규칙 관리.
- 인증은 JWT(localStorage) 기반, 클라이언트가 백엔드를 직접 호출.

---

## 3. 기술 스택

| 영역 | 기술 |
|---|---|
| 프론트엔드 | Next.js 16 (App Router, Turbopack), React 19, Tailwind v4, PWA |
| 백엔드 | FastAPI, SQLAlchemy 2, Alembic, APScheduler |
| DB | PostgreSQL (로컬은 Docker Compose) |
| 인증 | JWT + 초대 코드 / Google OAuth 2.0 (Calendar) |
| 알림 | Web Push (자체 VAPID, `pywebpush`) |
| 외부 연동 | Google Calendar API, GCS Pulse API |
| 비밀 암호화 | Fernet (Google client secret, GCS 토큰 등) |

### 백엔드 API 라우터
`auth` · `books` · `calendar` · `habits` · `push` · `snippets` · `tasks` · `team` · `token_usage` · `users`
(+ `/api/health` 헬스체크, 앱 기동 시 알림 스케줄러 start/stop)

### 프로젝트 구조
```
backend/    FastAPI 앱 (app/api, app/models, app/schemas, app/services), Alembic 마이그레이션, docker-compose(postgres)
frontend/   Next.js PWA (app/, components/, lib/)
docs/       요구사항 정의서, UI 디자인 가이드, Google Calendar 연동 가이드, 로고, 본 서비스 소개
```

---

## 4. 화면(라우트) 지도

| 라우트 | 설명 |
|---|---|
| `/home` | 홈 대시보드 (기본 랜딩, 위젯 + 할 일) |
| `/tasks` | 오늘/이번 주 할 일 |
| `/today` | 일정 타임테이블 (일/주/월) |
| `/habits` | 습관 등록·체크·streak·월간 완료율 |
| `/snippets` | 데일리 스니펫 + 잔디 히트맵 |
| `/team` | 팀 헬스체크 대시보드 |
| `/team-space` | 팀 비전/미션/규칙 |
| `/reading` | 독서 트래커 |
| `/tokens` | LLM 토큰 사용량 |
| `/settings` | Google API 연결, GCS 토큰, 테마 등 |
| `/admin` | 관리자 (초대 코드) |
| `/onboarding` | 가입 후 팀 코드 + GCS 토큰 등록 |
| `/login`, `/register` | 로그인 / 초대 코드 가입 |

---

## 5. 관련 문서

- [요구사항 정의서](요구사항정의서_일정습관관리도구.md)
- [UI 디자인 가이드](UI_디자인가이드.md)
- [Google Calendar 연동 가이드](Google_Calendar_연동_가이드.md)
- [Swagger UI (FastAPI 문서)](Swagger%20UI%20-%20FastAPI%20문서.md)
