import { api } from "./api";
import type {
  AiSource,
  Book,
  BookInput,
  BookScope,
  BookStatus,
  Bottleneck,
  BottleneckAction,
  BottleneckInput,
  CalendarEvent,
  Dashboard,
  EmailBrief,
  EmailDetail,
  EmailFolder,
  EmailListOut,
  EventInput,
  GmailStatus,
  MyGoogleIntegration,
  Habit,
  HabitLog,
  HabitStats,
  HeatmapDay,
  InviteCode,
  MeetingRoom,
  MeetingRoomReservation,
  MeetingRoomReservationWithRoom,
  PushSubscriptionRow,
  RecurringReservationInput,
  RecurringReservationRule,
  Snippet,
  Task,
  TaskScope,
  TaskStatus,
  TaskView,
  TeamEditPolicy,
  TeamHealthEntry,
  TeamPermissions,
  TeamProfile,
  TeamRule,
} from "./types";

// ---- Calendar ----
export const calendarApi = {
  // `returnTo` is the frontend path the OAuth callback sends the user back to
  // (defaults to /settings on the server).
  authorizeUrl: (returnTo?: string) =>
    api<{ auth_url: string }>("/api/calendar/oauth/authorize", { query: { return_to: returnTo } }),
  // The server serves a recently-synced window straight from its cache;
  // `refresh` forces a fresh pull from Google.
  listEvents: (start: string, end: string, refresh = false) =>
    api<CalendarEvent[]>("/api/calendar/events", {
      query: { start, end, refresh: refresh || undefined },
    }),
  create: (body: EventInput) => api<CalendarEvent>("/api/calendar/events", { method: "POST", body }),
  update: (id: number, body: Partial<EventInput>) =>
    api<CalendarEvent>(`/api/calendar/events/${id}`, { method: "PATCH", body }),
  remove: (id: number) => api<void>(`/api/calendar/events/${id}`, { method: "DELETE" }),
};

// ---- Dashboard (홈 화면 한 번에 조회) ----
export const dashboardApi = {
  // `date`는 사용자 로컬 날짜, `start`/`end`는 오늘 일정 조회 범위. 서버(UTC)가
  // 스스로 계산하면 KST 사용자와 하루가 어긋나므로 클라이언트가 넘긴다.
  get: (date: string, start: string, end: string) =>
    api<Dashboard>("/api/dashboard", { query: { date, start, end } }),
};

// ---- Gmail (read-only) ----
export const gmailApi = {
  authorizeUrl: (returnTo?: string) =>
    api<{ auth_url: string }>("/api/gmail/oauth/authorize", { query: { return_to: returnTo } }),
  list: (folder: EmailFolder, pageToken?: string | null) =>
    api<EmailListOut>("/api/gmail/messages", { query: { folder, page_token: pageToken } }),
  get: (id: string) => api<EmailDetail>(`/api/gmail/messages/${id}`),
  // AI 요약 + 할 일 추출. 서버에 ANTHROPIC_API_KEY가 있어야 동작한다.
  brief: (id: string) =>
    api<EmailBrief>(`/api/gmail/messages/${id}/brief`, { method: "POST" }),
  // Which Google account is connected for email (independent of Calendar).
  status: () => api<GmailStatus>("/api/gmail/status"),
  // Drop the stored Gmail tokens so a different account can be connected.
  disconnect: () => api<void>("/api/gmail/connection", { method: "DELETE" }),
};

// ---- Habits ----
export const habitsApi = {
  list: () => api<Habit[]>("/api/habits"),
  create: (body: { name: string; category: string; repeat_days: string; target_time: string }) =>
    api<Habit>("/api/habits", { method: "POST", body }),
  update: (id: number, body: Partial<Habit>) =>
    api<Habit>(`/api/habits/${id}`, { method: "PATCH", body }),
  remove: (id: number) => api<void>(`/api/habits/${id}`, { method: "DELETE" }),
  setCompletion: (id: number, date: string, completed: boolean) =>
    api<HabitLog>(`/api/habits/${id}/logs/${date}`, { method: "POST", query: { completed } }),
  logs: (date: string) => api<HabitLog[]>("/api/habits/logs", { query: { date } }),
  logsRange: (from: string, to: string) =>
    api<HabitLog[]>("/api/habits/logs/range", { query: { from_date: from, to_date: to } }),
  missed: (date: string) => api<Habit[]>("/api/habits/missed", { query: { date } }),
  stats: (id: number, year: number, month: number) =>
    api<HabitStats>(`/api/habits/${id}/stats`, { query: { year, month } }),
};

// ---- Snippets ----
export const snippetsApi = {
  list: (scope: "own" | "team", from_date?: string, to_date?: string, limit?: number) =>
    api<Snippet[]>("/api/snippets", { query: { scope, from_date, to_date, limit } }),
  create: (content: string) => api<Snippet>("/api/snippets", { method: "POST", body: { content } }),
  update: (id: number, content: string) =>
    api<Snippet>(`/api/snippets/${id}`, { method: "PUT", body: { content } }),
  remove: (id: number) => api<void>(`/api/snippets/${id}`, { method: "DELETE" }),
  heatmap: (year: number, month: number, scope: "own" | "team") =>
    api<HeatmapDay[]>("/api/snippets/heatmap", { query: { year, month, scope } }),
  comment: (id: number, content: string) =>
    api<unknown>(`/api/snippets/${id}/comments`, { method: "POST", query: { content } }),
  // AI 제안: reorganize a draft (does not save). `source` says which engine
  // answered — GCS Pulse, or our own Claude fallback when Pulse is down.
  organize: (content: string) =>
    api<{ date: string; organized_content: string; source: AiSource }>("/api/snippets/organize", {
      method: "POST",
      body: { content },
    }),
  // AI 채점: grade today's snippet (save it first — Pulse grades the stored
  // copy). The body is what the Claude fallback grades if Pulse fails.
  feedback: (content: string) =>
    api<{ date: string; ai_score: number | null; feedback: string | null; source: AiSource }>(
      "/api/snippets/feedback",
      { method: "POST", body: { content } }
    ),
};

export const teamApi = {
  health: (days = 14) => api<TeamHealthEntry[]>("/api/team/health", { query: { days } }),
};

// ---- Tasks (To-Do) ----
export const tasksApi = {
  list: (scope: TaskScope, view: TaskView = "own") =>
    api<Task[]>("/api/tasks", { query: { scope, view } }),
  create: (title: string, scope: TaskScope) =>
    api<Task>("/api/tasks", { method: "POST", body: { title, scope } }),
  update: (
    id: number,
    body: { title?: string; status?: TaskStatus; completed?: boolean; scope?: TaskScope }
  ) => api<Task>(`/api/tasks/${id}`, { method: "PATCH", body }),
  remove: (id: number) => api<void>(`/api/tasks/${id}`, { method: "DELETE" }),
  // History of past today/week tasks (mirrors the team pool's claimed-record log).
  log: () => api<Task[]>("/api/tasks/log"),
  // ---- Event-linked tasks ("일정 할일") ----
  byEvent: (eventId: number) => api<Task[]>(`/api/tasks/by-event/${eventId}`),
  createForEvent: (title: string, eventId: number) =>
    api<Task>("/api/tasks", { method: "POST", body: { title, calendar_event_id: eventId } }),
  // Promote an event-linked task into this week's "할 일" column.
  promoteToWeek: (id: number) => api<Task>(`/api/tasks/${id}`, { method: "PATCH", body: { scope: "week" } }),
  // Move/reorder: `ids` is the target column's full order; any task not already
  // in `scope` is moved into it. Returns the updated tasks for that column.
  reorder: (scope: TaskScope, ids: number[]) =>
    api<Task[]>("/api/tasks/reorder", { method: "PUT", body: { scope, ids } }),
  // ---- Team shared pool ("팀 할일") ----
  // Unclaimed tasks owned by no one; any teammate can claim one into their own list.
  teamPool: () => api<Task[]>("/api/tasks/team-pool"),
  // Record of claimed pool tasks (who took what, when) — each is restorable.
  claimedTeamTasks: () => api<Task[]>("/api/tasks/team-pool/claimed"),
  createTeamTask: (title: string) =>
    api<Task>("/api/tasks/team-pool", { method: "POST", body: { title } }),
  claimTeamTask: (id: number) =>
    api<Task>(`/api/tasks/team-pool/${id}/claim`, { method: "POST" }),
  // Undo a claim: return the task to the pool.
  restoreTeamTask: (id: number) =>
    api<Task>(`/api/tasks/team-pool/${id}/restore`, { method: "POST" }),
  removeTeamTask: (id: number) => api<void>(`/api/tasks/team-pool/${id}`, { method: "DELETE" }),
};

// ---- Books (Reading) ----
export const booksApi = {
  list: (scope: BookScope = "own", status?: BookStatus) =>
    api<Book[]>("/api/books", { query: { scope, status } }),
  create: (body: BookInput) => api<Book>("/api/books", { method: "POST", body }),
  update: (id: number, body: Partial<BookInput>) =>
    api<Book>(`/api/books/${id}`, { method: "PATCH", body }),
  remove: (id: number) => api<void>(`/api/books/${id}`, { method: "DELETE" }),
};

// ---- Bottlenecks (팀/프로젝트 병목) ----
export const bottlenecksApi = {
  list: () => api<Bottleneck[]>("/api/bottlenecks"),
  create: (body: BottleneckInput) =>
    api<Bottleneck>("/api/bottlenecks", { method: "POST", body }),
  update: (id: number, body: Partial<BottleneckInput>) =>
    api<Bottleneck>(`/api/bottlenecks/${id}`, { method: "PATCH", body }),
  remove: (id: number) => api<void>(`/api/bottlenecks/${id}`, { method: "DELETE" }),
  addAction: (id: number, body: { content: string; effect?: string; done?: boolean }) =>
    api<BottleneckAction>(`/api/bottlenecks/${id}/actions`, { method: "POST", body }),
  updateAction: (
    id: number,
    actionId: number,
    body: { content?: string; effect?: string; done?: boolean }
  ) => api<BottleneckAction>(`/api/bottlenecks/${id}/actions/${actionId}`, { method: "PATCH", body }),
  removeAction: (id: number, actionId: number) =>
    api<void>(`/api/bottlenecks/${id}/actions/${actionId}`, { method: "DELETE" }),
};

// ---- Team space (vision / mission / rules) ----
export const teamSpaceApi = {
  profile: () => api<TeamProfile>("/api/team/profile"),
  // Who may edit 팀룰 / 비전·미션. Reading is open to the team; only an admin
  // can change the policies.
  permissions: () => api<TeamPermissions>("/api/team/permissions"),
  updatePermissions: (body: {
    rules_edit_policy?: TeamEditPolicy;
    profile_edit_policy?: TeamEditPolicy;
  }) => api<TeamPermissions>("/api/team/permissions", { method: "PUT", body }),
  updateProfile: (body: { vision: string; mission: string }) =>
    api<TeamProfile>("/api/team/profile", { method: "PUT", body }),
  rules: () => api<TeamRule[]>("/api/team/rules"),
  createRule: (content: string) =>
    api<TeamRule>("/api/team/rules", { method: "POST", body: { content } }),
  updateRule: (id: number, body: { content?: string; sort_order?: number }) =>
    api<TeamRule>(`/api/team/rules/${id}`, { method: "PATCH", body }),
  removeRule: (id: number) => api<void>(`/api/team/rules/${id}`, { method: "DELETE" }),
};

// ---- Meeting rooms (GCS Pulse) ----
export const meetingRoomsApi = {
  list: () => api<MeetingRoom[]>("/api/meeting-rooms"),
  reservations: (roomId: number, date: string) =>
    api<MeetingRoomReservation[]>(`/api/meeting-rooms/${roomId}/reservations`, { query: { date } }),
  // Every room's reservations for one day in a single request — the dashboard
  // widget would otherwise fetch the room list plus one request per room.
  allReservations: (date: string) =>
    api<MeetingRoomReservationWithRoom[]>("/api/meeting-rooms/reservations", { query: { date } }),
  reserve: (roomId: number, body: { start_at: string; end_at: string; purpose?: string | null }) =>
    api<MeetingRoomReservation>(`/api/meeting-rooms/${roomId}/reservations`, { method: "POST", body }),
  cancel: (reservationId: number) =>
    api<{ message: string }>(`/api/meeting-rooms/reservations/${reservationId}`, { method: "DELETE" }),
  recurring: {
    list: () => api<RecurringReservationRule[]>("/api/meeting-rooms/recurring"),
    create: (body: RecurringReservationInput) =>
      api<RecurringReservationRule>("/api/meeting-rooms/recurring", { method: "POST", body }),
    remove: (ruleId: number) =>
      api<{ message: string }>(`/api/meeting-rooms/recurring/${ruleId}`, { method: "DELETE" }),
  },
};

// ---- Push ----
export const pushApi = {
  vapidKey: () => api<{ public_key: string }>("/api/push/vapid-public-key", { auth: false }),
  list: () => api<PushSubscriptionRow[]>("/api/push/subscriptions"),
  subscribe: (body: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
    device_label?: string;
  }) => api<PushSubscriptionRow>("/api/push/subscriptions", { method: "POST", body }),
  remove: (id: number) => api<void>(`/api/push/subscriptions/${id}`, { method: "DELETE" }),
};

// ---- Users / GCS Pulse token ----
export const usersApi = {
  setGcsPulseToken: (api_token: string) =>
    api<void>("/api/users/me/gcs-pulse-token", { method: "PUT", body: { api_token } }),
  gcsPulseStatus: () => api<{ connected: boolean }>("/api/users/me/gcs-pulse-token/status"),
  setTeam: (team_id: string) =>
    api<void>("/api/users/me/team", { method: "PUT", body: { team_id } }),
  completeOnboarding: (team_id: string, api_token: string) =>
    api<void>("/api/users/me/onboarding", { method: "POST", body: { team_id, api_token } }),
  onboardingStatus: () =>
    api<{ team_id: string; gcs_connected: boolean; completed: boolean }>(
      "/api/users/me/onboarding-status"
    ),
};

// ---- Integrations (per-user Google OAuth client) ----
export const integrationsApi = {
  // Per-user: each member enters their own Google Client ID/Secret.
  getMyGoogle: () => api<MyGoogleIntegration>("/api/integrations/google/me"),
  setMyGoogle: (body: { client_id: string; client_secret?: string }) =>
    api<MyGoogleIntegration>("/api/integrations/google/me", { method: "PUT", body }),
  googleStatus: () => api<{ configured: boolean }>("/api/integrations/google/status"),
};

// ---- Invite codes (admin) ----
export const inviteApi = {
  list: () => api<InviteCode[]>("/api/auth/invite-codes"),
  create: (expires_in_days: number | null) =>
    api<InviteCode>("/api/auth/invite-codes", { method: "POST", body: { expires_in_days } }),
  remove: (id: number) => api<void>(`/api/auth/invite-codes/${id}`, { method: "DELETE" }),
};
