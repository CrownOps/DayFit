# Google Calendar 연동 설정 가이드

DayFit의 캘린더 연동(일정 읽기/쓰기/동기화)을 실제로 쓰려면 Google OAuth 클라이언트가 필요합니다.
백엔드 코드는 이미 완성돼 있고, 아래에서 발급받은 **Client ID / Client Secret 두 값만** `backend/.env`에 넣으면 동작합니다.

소요 시간: 약 10분. 비용 없음.

---

## 1. Google Cloud 프로젝트 만들기

1. https://console.cloud.google.com 접속 (은지님 구글 계정으로 로그인)
2. 상단 프로젝트 선택 드롭다운 → **새 프로젝트** → 이름 `DayFit` → 만들기
3. 생성 후 그 프로젝트가 선택돼 있는지 확인

## 2. Google Calendar API 사용 설정

1. 왼쪽 메뉴 → **API 및 서비스 → 라이브러리**
2. `Google Calendar API` 검색 → 클릭 → **사용(Enable)**

## 3. OAuth 동의 화면(Consent screen) 구성

1. **API 및 서비스 → OAuth 동의 화면**
2. User Type: **외부(External)** 선택 → 만들기
3. 앱 정보:
   - 앱 이름: `DayFit`
   - 사용자 지원 이메일: 본인 이메일
   - 개발자 연락처 이메일: 본인 이메일
   - (로고/도메인은 비워도 됨) → 저장 후 계속
4. **범위(Scopes)**: 여기서는 추가 안 해도 됨 (앱이 요청 시 지정) → 저장 후 계속
5. **테스트 사용자(Test users)**: `+ ADD USERS` → 은지님과 팀원 이메일 추가
   - ⚠️ 앱을 "게시(Publish)"하지 않고 **테스트 모드로 두면**, 여기 등록된 이메일만 로그인할 수 있습니다. CrownOps 2인 팀 자체 사용이니 테스트 모드로 충분합니다.
6. 저장 후 계속 → 대시보드로

## 4. OAuth 클라이언트 ID 발급

1. **API 및 서비스 → 사용자 인증 정보(Credentials)**
2. 상단 **+ 사용자 인증 정보 만들기 → OAuth 클라이언트 ID**
3. 애플리케이션 유형: **웹 애플리케이션**
4. 이름: `DayFit Web`
5. **승인된 리디렉션 URI(Authorized redirect URIs)** 에 아래를 추가:
   ```
   http://localhost:8000/api/calendar/oauth/callback
   ```
   - 나중에 서버를 배포하면 배포 도메인 버전도 추가 (예: `https://api.내도메인/api/calendar/oauth/callback`)
6. 만들기 → **Client ID**와 **Client Secret**이 표시됨 → 둘 다 복사

## 5. 백엔드 .env에 값 넣기

`backend/.env` 파일에서 아래 두 줄을 채웁니다:

```
GOOGLE_CLIENT_ID=여기에_클라이언트_ID
GOOGLE_CLIENT_SECRET=여기에_클라이언트_시크릿
```

`GOOGLE_REDIRECT_URI`는 이미 `http://localhost:8000/api/calendar/oauth/callback`로 설정돼 있어 그대로 두면 됩니다 (4-5단계 리디렉션 URI와 정확히 일치해야 함).

## 6. 적용 & 확인

1. 백엔드 재시작:
   ```
   cd backend
   venv/Scripts/python -m uvicorn app.main:app --port 8000
   ```
2. 프론트(`http://localhost:3000`) 로그인 → **설정 → Google Calendar 연결** 클릭
3. 구글 동의 화면에서 캘린더 접근 허용
4. 자동으로 앱 설정 화면으로 돌아오고 "✓ 연결됨"이 뜨면 성공
5. **오늘** 화면에 구글 캘린더 일정이 타임테이블로 표시됨

---

## 참고 / 주의

- 연결 시 앱이 **기존 캘린더 일정들의 알림을 일괄로 끕니다**(요구사항 F-7). DayFit 자체 웹 푸시로 알림을 통합하기 위함입니다. 이 동작을 원치 않으면 알려주세요.
- 테스트 모드 앱의 리프레시 토큰은 7일 후 만료될 수 있습니다(구글 정책). 만료되면 설정에서 다시 연결하면 됩니다. 상시 사용하려면 OAuth 동의 화면을 "게시(Production)"로 전환하면 되는데, 그 경우 구글 검증이 필요할 수 있습니다. 2인 팀 사용에는 테스트 모드 + 필요시 재연결로 충분합니다.
- `GOOGLE_CLIENT_SECRET`은 절대 깃에 커밋하지 마세요. `backend/.env`는 이미 `.gitignore`에 있습니다.
