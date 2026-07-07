# Google Calendar 연동 설정 가이드 (개인별)

DayFit 캘린더 연동은 **각자 본인 Google OAuth 클라이언트를 만들어** 본인 캘린더를 연결합니다.
값은 앱 **설정 → "Google API 연결"** 카드에 입력합니다. (관리자 공용 설정 아님 — 팀원마다 각자 1회.)

소요 시간: 1인당 약 10분. 비용 없음.

---

## 0. 리디렉션 URI (먼저 복사)

```
https://dayfit-api-production.up.railway.app/api/calendar/oauth/callback
```

> 설정 → "Google API 연결" 카드에도 이 값이 표시됩니다. 본인 Google 클라이언트에 등록하는 값과 **정확히 일치**해야 합니다.

## 1. Google Cloud 프로젝트 만들기 (본인 계정)

1. https://console.cloud.google.com 접속 (본인 구글 계정으로 로그인)
2. 상단 프로젝트 드롭다운 → **새 프로젝트** → 이름 `DayFit` → 만들기
3. 생성된 프로젝트가 선택돼 있는지 확인

## 2. Google Calendar API 사용 설정

1. 왼쪽 메뉴 → **API 및 서비스 → 라이브러리**
2. `Google Calendar API` 검색 → 클릭 → **사용(Enable)**

## 3. OAuth 동의 화면(Consent screen) 구성

1. **API 및 서비스 → OAuth 동의 화면**
2. **User Type**:
   - 회사 **Google Workspace** 계정이면 → **내부(Internal)** 권장 (테스트 사용자 등록 불필요, 리프레시 토큰 7일 만료 없음)
   - 일반 계정이면 → **외부(External)**
3. 앱 정보: 앱 이름 `DayFit`, 지원/개발자 이메일에 본인 이메일 → 저장 후 계속
4. **범위(Scopes)**: 추가 안 해도 됨 → 저장 후 계속
5. **테스트 사용자(Test users)** — *External + 테스트 모드일 때*:
   - `+ ADD USERS` → **본인 이메일만** 추가하면 됩니다 (각자 자기 클라이언트라 팀원 추가 불필요)
6. 저장 후 계속

## 4. OAuth 클라이언트 ID 발급

1. **API 및 서비스 → 사용자 인증 정보(Credentials)**
2. **+ 사용자 인증 정보 만들기 → OAuth 클라이언트 ID**
3. 애플리케이션 유형: **웹 애플리케이션**
4. 이름: `DayFit Web`
5. **승인된 리디렉션 URI**에 0단계 값을 그대로 추가:
   ```
   https://dayfit-api-production.up.railway.app/api/calendar/oauth/callback
   ```
6. 만들기 → **Client ID**와 **Client Secret** 복사

## 5. 앱에 본인 값 넣기

1. DayFit(https://dayfit-web-production.up.railway.app)에 본인 계정으로 로그인
2. **설정 → "Google API 연결"** 카드
3. **Client ID / Client Secret** 입력 → **저장** → 상태가 "설정됨"으로 바뀜

## 6. 본인 캘린더 연결

1. 같은 화면 아래 **"Google Calendar 연결"** 클릭
2. 구글 동의 화면에서 캘린더 접근 허용
3. "✓ 연결됨" 표시되면 성공
4. **오늘/일정** 화면에 본인 구글 캘린더 일정이 표시됨

---

## 참고 / 주의

- 팀원은 각자 1~6단계를 **본인 계정으로** 진행합니다 (공용 클라이언트 없음).
- 연결 시 앱이 **본인 캘린더의 기존 일정 알림을 일괄로 끕니다**(요구사항 F-7). DayFit 웹 푸시로 알림을 통합하기 위함입니다.
- **External + 테스트 모드**의 리프레시 토큰은 7일 후 만료될 수 있습니다(구글 정책). 만료되면 설정에서 다시 연결. 상시 사용하려면 **Internal(Workspace)** 로 쓰거나 동의 화면을 "게시(Production)"로 전환(검증 필요할 수 있음).
- Client Secret은 앱 DB에 Fernet 암호화되어 저장되며, 깃에 커밋되지 않습니다.
