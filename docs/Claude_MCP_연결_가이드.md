# Claude MCP 연결 가이드

Claude Code나 Claude 데스크톱 앱(Code 탭)에서 대화하면서 DayFit 할 일을 추가·조회·완료할 수 있다.
DayFit 백엔드의 `/api/mcp`가 MCP 서버 역할을 한다.

## 연결하기

1. DayFit **설정 → Claude 연결 (MCP)** 에서 토큰 이름을 정하고 **토큰 발급**을 누른다.
2. 화면에 나온 명령을 복사해 터미널에서 한 번 실행한다.

   ```bash
   claude mcp add --transport http --scope user dayfit https://<도메인>/api/mcp --header "Authorization: Bearer dft_..."
   ```

   `--scope user`라서 어느 폴더에서 Claude를 열어도 DayFit 도구를 쓸 수 있다.
3. 연결 상태를 확인한다. `Status: ✔ Connected`가 나오면 된다.

   ```bash
   claude mcp get dayfit
   ```

토큰 원문은 발급할 때 한 번만 보여 준다. 서버에는 해시만 저장된다. 토큰을 잃어버리면 폐기하고 새로 발급한다.
설정 화면의 토큰 목록에서 언제든 폐기할 수 있고, 폐기하는 즉시 연결이 끊긴다.

## 이렇게 말하면 된다

- "오늘 할 일에 보고서 초안 쓰기랑 치과 예약 넣어줘"
- "이번 주 할 일 뭐 남았어?"
- "보고서 초안 진행 중으로 바꿔줘" / "치과 예약 완료"
- "회의에서 나온 거 정리해서 이번 주 할 일로 넣어줘" (회의 메모를 붙여 넣고)
- "팀 할 일에 배포 체크리스트 정리 추가해줘"

## 도구

| 도구 | 하는 일 |
|---|---|
| `list_tasks` | 오늘/이번 주 할 일을 id·상태와 함께 조회 |
| `add_tasks` | 오늘 또는 이번 주 칸에 여러 개를 한 번에 추가 |
| `update_task` | 제목·상태(todo/in_progress/done)·칸(today/week) 변경 |
| `delete_task` | 내 할 일 삭제 |
| `list_team_pool` | 팀 할 일 풀 조회 |
| `add_team_tasks` | 팀 할 일 풀에 추가 |

도구들은 웹 앱이 쓰는 할 일 API 함수를 그대로 호출한다. 정렬, 자정 롤오버, 팀 풀 권한 같은 규칙이 웹 앱과 똑같이 적용된다.

## 참고

- 같은 토큰으로 일반 REST API(`/api/tasks` 등)도 호출할 수 있다. 스크립트나 단축어 자동화에 쓸 수 있다.
- claude.ai 웹/모바일의 커스텀 커넥터는 OAuth를 요구해서 이 방식(헤더 토큰)으로는 연결되지 않는다.
- 전송 방식은 MCP Streamable HTTP의 stateless 형태다. 요청은 POST로 받고 JSON으로 응답한다.
