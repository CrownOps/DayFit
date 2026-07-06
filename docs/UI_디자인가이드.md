# UI 디자인 가이드: 통합 일정·습관·타임테이블 관리 도구

- 작성일: 2026-07-06
- 작성 대상: Claude Code
- 관련 문서: `요구사항정의서_일정습관관리도구.md`
- 문서 목적: 라이트/다크 모드 색상 시스템과 기본 UI 원칙을 정의해, 개발 시 매번 색을 새로 고민하지 않고 이 토큰만 가져다 쓰면 되게 한다.

---

## 0. 디자인 방향 요약

이 앱은 **하루에도 여러 번, 매일 오래 들여다보는 도구**다(타임테이블 확인, 습관 체크, 알림 확인). 그래서 "화려함"보다 **눈의 피로도, 가독성, 정보 위계**가 최우선이다. 방향은 이렇게 잡는다.

1. 순백(#FFFFFF)·순흑(#000000)은 쓰지 않는다 — 대비가 너무 강해 장시간 보면 눈이 쉽게 피로해진다. 대신 따뜻한 톤이 살짝 섞인 오프화이트/차콜을 기본 배경으로 쓴다.
2. 강조색은 채도를 낮춘("muted") 색을 쓴다 — 원색에 가까운 비비드 컬러는 알림이 뜰 때마다 자극적으로 느껴진다.
3. 색은 장식이 아니라 정보다 — 습관 완료/미완료, 일정 카테고리, 토큰 사용량 경고 등 "상태"를 색으로 구분하되, 그 외 UI는 최대한 무채색(그레이스케일) 위주로 조용하게 둔다.
4. 시스템 설정(`prefers-color-scheme`)을 기본으로 따르되, 앱 안에서 라이트/다크를 수동으로 토글할 수 있게 한다.

---

## 1. 컬러 시스템

### 1.1 라이트 모드

| 역할 | 색상 이름 | HEX | 용도 |
|---|---|---|---|
| Background (base) | Warm Paper | `#F6F4EF` | 앱 전체 배경. 순백 대신 아주 옅은 웜톤 오프화이트 |
| Surface (카드/패널) | Soft White | `#FDFCFA` | 타임테이블 카드, 습관 리스트, 모달 등 |
| Border / Divider | Warm Line | `#E3DFD6` | 구분선, 카드 테두리 |
| Text — Primary | Ink | `#2B2A27` | 본문, 제목 |
| Text — Secondary | Warm Gray | `#6E6A61` | 보조 설명, 타임스탬프 |
| Text — Tertiary / Placeholder | Faint Gray | `#A29D91` | 빈 입력칸, 비활성 텍스트 |
| Accent — Primary | Slate Teal | `#3E6F68` | 주요 버튼, 링크, 선택된 탭, "지금" 표시선 |
| Accent — Primary Hover | Deep Teal | `#2F5750` | primary 요소의 hover/active 상태 |
| Accent — Secondary | Muted Amber | `#C98A4B` | 습관 streak, 강조 배지, 두 번째 CTA |
| Success | Sage Green | `#6B9E78` | 습관 체크 완료, 정상 상태 |
| Warning | Warm Amber | `#D2984B` | 알림 예정, 임박한 일정 |
| Danger | Muted Brick | `#B5564A` | 놓친 습관, 삭제, 토큰 사용량 초과 경고 |
| Info | Dusty Blue | `#5A80A0` | 안내 메시지, 툴팁 |

### 1.2 다크 모드

다크 모드는 라이트 모드의 색상 관계(어떤 색이 무엇을 의미하는지)를 유지하되, 명도만 반전시키고 채도는 살짝 낮춘다. 순흑 대신 아주 옅게 갈색이 도는 차콜을 쓴다(모니터 번인 방지 + 눈부심 완화에도 유리).

| 역할 | 색상 이름 | HEX | 용도 |
|---|---|---|---|
| Background (base) | Charcoal | `#181816` | 앱 전체 배경 |
| Surface (카드/패널) | Raised Charcoal | `#232220` | 타임테이블 카드, 습관 리스트, 모달 등 |
| Border / Divider | Warm Line Dark | `#38362F` | 구분선, 카드 테두리 |
| Text — Primary | Warm White | `#ECE8DF` | 본문, 제목 (순백 대신 살짝 웜톤) |
| Text — Secondary | Muted Tan | `#A9A398` | 보조 설명, 타임스탬프 |
| Text — Tertiary / Placeholder | Dim Gray | `#726D62` | 빈 입력칸, 비활성 텍스트 |
| Accent — Primary | Soft Teal | `#6FA89C` | 주요 버튼, 링크, 선택된 탭, "지금" 표시선 |
| Accent — Primary Hover | Bright Teal | `#84BBAE` | primary 요소의 hover/active 상태 |
| Accent — Secondary | Soft Amber | `#E0A968` | 습관 streak, 강조 배지, 두 번째 CTA |
| Success | Muted Sage | `#8CBB92` | 습관 체크 완료, 정상 상태 |
| Warning | Soft Amber | `#E0A968` | 알림 예정, 임박한 일정 |
| Danger | Soft Brick | `#D97F73` | 놓친 습관, 삭제, 토큰 사용량 초과 경고 |
| Info | Soft Blue | `#7FA3C0` | 안내 메시지, 툴팁 |

### 1.3 왜 이 팔레트인가 (선택 이유)

- **테라코타/주황 계열을 메인 강조색으로 쓰지 않음**: 웜톤 배경 + 주황 계열 강조색은 요즘 AI가 만드는 디자인에서 가장 흔한 패턴 중 하나라 개성이 없고, 장시간 보는 도구에는 다소 자극적이다. 대신 채도를 낮춘 **틸(teal)**을 메인으로 써서 차분하고 "일하는 도구"다운 톤을 만든다.
- **초록/청록 계열이 메인인 이유**: 사람 눈은 녹색 파장 대역에 가장 민감하면서도 피로감은 적게 느끼는 것으로 알려져 있어, 매일 반복해서 보는 UI의 메인 색으로 적합하다.
- **다크 모드에 순수 블랙 대신 웜 차콜을 쓰는 이유**: 순흑 배경 + 순백 텍스트의 초고대비 조합은 눈이 계속 명암에 재적응해야 해서 장시간 사용 시 피로가 누적된다. 살짝 갈색이 도는 차콜 배경 + 오프화이트 텍스트가 더 편안하다.
- **채도를 낮춘("muted") 톤을 쓰는 이유**: 알림/경고 색(Warning, Danger)도 원색이 아니라 채도를 낮춰서, 알림이 뜰 때마다 눈을 찌르는 느낌 없이 "정보"로만 인지되게 한다.

### 1.4 캘린더 카테고리 색 (선택, 참고용)

일정 카테고리별로 구분색을 쓰고 싶다면 아래 팔레트를 추천한다. 모두 서로 명확히 구분되면서도 채도가 비슷해 화면이 시끄러워지지 않는다.

| 카테고리 예시 | 라이트 모드 | 다크 모드 |
|---|---|---|
| 수업/과외 | `#3E6F68` (Slate Teal) | `#6FA89C` (Soft Teal) |
| 미팅/업무 | `#8C7FA0` (Muted Lavender) | `#A79BC0` (Soft Lavender) |
| 개인 약속 | `#C98A4B` (Muted Amber) | `#E0A968` (Soft Amber) |
| 습관/루틴 | `#6B9E78` (Sage Green) | `#8CBB92` (Muted Sage) |
| 데일리 스니펫 표시 | `#6E6A61` (Warm Gray, 라이트) | `#A9A398` (Muted Tan, 다크) |

---

## 2. 타이포그래피

이 앱은 텍스트 밀도가 높은 대시보드형 도구이므로, 화려한 디스플레이 서체보다 **가독성이 검증된 산세리프 하나 + 숫자 정렬용 모노스페이스 하나**로 충분하다.

| 역할 | 폰트 | 용도 |
|---|---|---|
| UI 본문/제목 | `Inter` (또는 시스템 폰트 스택: `-apple-system, "Segoe UI", Pretendard, sans-serif`) | 모든 UI 텍스트. 한글 병기를 고려해 `Pretendard`를 국문 폴백으로 권장 |
| 숫자/시간/토큰 사용량 | `IBM Plex Mono` 또는 `JetBrains Mono` | 타임테이블의 시각(09:00), 토큰 사용량 숫자, streak 일수 — 자릿수가 흔들리지 않아 스캔하기 쉬움 |

**타입 스케일 (제안)**
- Display (온보딩/빈 화면 안내 문구): 28px / 700
- H1 (페이지 제목, 예: "오늘"): 22px / 600
- H2 (섹션 제목, 예: "습관", "팀 헬스체크"): 16px / 600
- Body (기본 텍스트): 14px / 400
- Caption (타임스탬프, 보조 설명): 12px / 400, Text-Secondary 색 사용
- 행간(line-height): 본문 1.5, 제목 1.3

---

## 3. 여백/모서리/그림자

| 항목 | 값 | 비고 |
|---|---|---|
| 기본 간격 단위 | 4px 배수 (4/8/12/16/24/32) | 모든 padding/margin은 이 스케일 안에서 |
| 카드 모서리 반경 | 12px | 너무 각지지도, 너무 둥글지도 않은 중간값 |
| 카드 그림자 (라이트) | `0 1px 3px rgba(43,42,39,0.08)` | 은은하게, 뜬 느낌만 |
| 카드 그림자 (다크) | 그림자 대신 `border: 1px solid Border색` 사용 | 다크 배경에서는 그림자보다 미세한 테두리가 더 잘 보임 |

---

## 4. 화면별 색상 적용 가이드

### 4.1 하루 타임테이블 뷰
- 배경은 Surface 색, 시간 눈금선은 Border 색으로 아주 옅게.
- "지금" 시각을 가로지르는 선은 Accent Primary(Teal) 색으로 명확하게 표시.
- 일정 블록은 카테고리 색(1.4 참고)을 배경에 10~15% 투명도로 옅게 깔고, 좌측에 카테고리 색 실선 바를 둬서 과하지 않게 구분.
- 빈 시간대(공백)는 별도 색 없이 Surface 그대로 두되, 옅은 대각선 패턴이나 "여유 시간" 라벨(Text-Tertiary 색)로만 표시.

### 4.2 습관 체크리스트
- 완료된 습관: 체크박스 Success 색으로 채움, 텍스트는 Text-Secondary로 톤 다운(완료된 건 시각적으로 "가라앉게").
- 미완료 습관: 기본 Text-Primary.
- 놓친 습관(시간 지남): 텍스트를 Danger 색으로, 굵기는 그대로(과하게 강조하지 않기).
- streak 배지: Accent Secondary(Amber) 색 배경에 흰 텍스트, 숫자는 모노스페이스.

### 4.3 데일리 스니펫 잔디(히트맵)
- 미작성일: Border 색과 비슷한 아주 옅은 회색 사각형.
- 작성일: Accent Primary(Teal)를 연한 단계부터 진한 단계까지 3~4단계로 나눠, 스니펫 분량/컨디션 점수에 따라 진하기를 다르게(깃허브 잔디와 동일한 방식).
- 오늘 날짜: 얇은 Accent Secondary(Amber) 테두리로 표시.

### 4.4 알림/토스트
- 일정 알림: Info 색 배경 계열.
- 습관 리마인드: Accent Secondary(Amber) 계열.
- 놓친 알림/에러: Danger 색 계열, 단 배경 전체를 채우지 말고 좌측 바 + 옅은 배경 톤 정도로 절제.

### 4.5 토큰 사용량 게이지
- 정상 범위: Success 색 바.
- 예산의 70~90%: Warning 색 바.
- 초과: Danger 색 바.
- 막대 배경(빈 부분)은 Border 색.

---

## 5. 다크모드 전환 UX

- 기본값은 시스템 설정을 따른다: CSS `prefers-color-scheme: dark` 미디어쿼리로 최초 진입 시 자동 적용.
- 설정 화면에 라이트/다크/시스템 자동, 3단 토글을 제공해 사용자가 명시적으로 오버라이드할 수 있게 한다.
- 선택값은 로컬에 저장해 다음 방문 때도 유지.
- 색 전환 시 배경/텍스트에 짧은 transition(150ms 정도)만 줘서 화면이 갑자기 번쩍이지 않게 한다.

---

## 6. 접근성 체크리스트

- 모든 본문 텍스트 대비비는 WCAG AA 기준(4.5:1) 이상 확보 — 위 팔레트의 Text-Primary/Secondary 조합은 각 배경에서 이 기준을 만족하도록 골랐으나, 실제 구현 시 대비 검사 도구로 재확인 권장.
- 색만으로 정보를 전달하지 않기 — 예를 들어 "놓친 습관"은 Danger 색뿐 아니라 아이콘(느낌표 등)이나 텍스트 라벨도 함께 표시.
- 키보드 포커스 링은 Accent Primary 색으로 2px 이상 두껍게, 배경과 명확히 구분되게.
- `prefers-reduced-motion` 설정 존중 — 애니메이션/전환 효과는 이 설정이 켜져 있으면 최소화.

---

## 7. 구현 참고 — CSS 변수 예시

```css
:root {
  --color-bg: #F6F4EF;
  --color-surface: #FDFCFA;
  --color-border: #E3DFD6;
  --color-text-primary: #2B2A27;
  --color-text-secondary: #6E6A61;
  --color-text-tertiary: #A29D91;
  --color-accent: #3E6F68;
  --color-accent-hover: #2F5750;
  --color-accent-secondary: #C98A4B;
  --color-success: #6B9E78;
  --color-warning: #D2984B;
  --color-danger: #B5564A;
  --color-info: #5A80A0;
}

[data-theme="dark"] {
  --color-bg: #181816;
  --color-surface: #232220;
  --color-border: #38362F;
  --color-text-primary: #ECE8DF;
  --color-text-secondary: #A9A398;
  --color-text-tertiary: #726D62;
  --color-accent: #6FA89C;
  --color-accent-hover: #84BBAE;
  --color-accent-secondary: #E0A968;
  --color-success: #8CBB92;
  --color-warning: #E0A968;
  --color-danger: #D97F73;
  --color-info: #7FA3C0;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    /* 위 [data-theme="dark"] 값과 동일하게 매핑 */
  }
}
```
