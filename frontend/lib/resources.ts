import { api } from "./api";
import type {
  Book,
  BookInput,
  BookScope,
  BookStatus,
  CalendarEvent,
  EventInput,
  GcsPulseQuota,
  GoogleIntegration,
  Habit,
  HabitLog,
  HabitStats,
  HeatmapDay,
  InviteCode,
  PushSubscriptionRow,
  Snippet,
  Task,
  TaskScope,
  TeamHealthEntry,
  TeamProfile,
  TeamRule,
  TokenUsageLog,
} from "./types";

// ---- Calendar ----
export const calendarApi = {
  authorizeUrl: () => api<{ auth_url: string }>("/api/calendar/oauth/authorize"),
  listEvents: (start: string, end: string) =>
    api<CalendarEvent[]>("/api/calendar/events", { query: { start, end } }),
  create: (body: EventInput) => api<CalendarEvent>("/api/calendar/events", { method: "POST", body }),
  update: (id: number, body: Partial<EventInput>) =>
    api<CalendarEvent>(`/api/calendar/events/${id}`, { method: "PATCH", body }),
  remove: (id: number) => api<void>(`/api/calendar/events/${id}`, { method: "DELETE" }),
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
  list: (scope: "own" | "team", from_date?: string, to_date?: string) =>
    api<Snippet[]>("/api/snippets", { query: { scope, from_date, to_date } }),
  create: (content: string) => api<Snippet>("/api/snippets", { method: "POST", body: { content } }),
  update: (id: number, content: string) =>
    api<Snippet>(`/api/snippets/${id}`, { method: "PUT", body: { content } }),
  remove: (id: number) => api<void>(`/api/snippets/${id}`, { method: "DELETE" }),
  heatmap: (year: number, month: number, scope: "own" | "team") =>
    api<HeatmapDay[]>("/api/snippets/heatmap", { query: { year, month, scope } }),
  comment: (id: number, content: string) =>
    api<unknown>(`/api/snippets/${id}/comments`, { method: "POST", query: { content } }),
};

export const teamApi = {
  health: (days = 14) => api<TeamHealthEntry[]>("/api/team/health", { query: { days } }),
};

// ---- Tasks (To-Do) ----
export const tasksApi = {
  list: (scope: TaskScope) => api<Task[]>("/api/tasks", { query: { scope } }),
  create: (title: string, scope: TaskScope) =>
    api<Task>("/api/tasks", { method: "POST", body: { title, scope } }),
  update: (id: number, body: { title?: string; completed?: boolean }) =>
    api<Task>(`/api/tasks/${id}`, { method: "PATCH", body }),
  remove: (id: number) => api<void>(`/api/tasks/${id}`, { method: "DELETE" }),
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

// ---- Team space (vision / mission / rules) ----
export const teamSpaceApi = {
  profile: () => api<TeamProfile>("/api/team/profile"),
  updateProfile: (body: { vision: string; mission: string }) =>
    api<TeamProfile>("/api/team/profile", { method: "PUT", body }),
  rules: () => api<TeamRule[]>("/api/team/rules"),
  createRule: (content: string) =>
    api<TeamRule>("/api/team/rules", { method: "POST", body: { content } }),
  updateRule: (id: number, body: { content?: string; sort_order?: number }) =>
    api<TeamRule>(`/api/team/rules/${id}`, { method: "PATCH", body }),
  removeRule: (id: number) => api<void>(`/api/team/rules/${id}`, { method: "DELETE" }),
};

// ---- Token usage ----
export const tokenApi = {
  quota: () => api<GcsPulseQuota>("/api/token-usage/gcs-pulse-quota"),
  list: (scope: "own" | "team", from_date?: string, to_date?: string) =>
    api<TokenUsageLog[]>("/api/token-usage", { query: { scope, from_date, to_date } }),
  addManual: (body: { date: string; model: string; input_tokens: number; output_tokens: number }) =>
    api<TokenUsageLog>("/api/token-usage/manual", { method: "POST", body }),
  removeManual: (id: number) => api<void>(`/api/token-usage/manual/${id}`, { method: "DELETE" }),
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

// ---- Integrations (Google OAuth config; admin) ----
export const integrationsApi = {
  getGoogle: () => api<GoogleIntegration>("/api/integrations/google"),
  setGoogle: (body: { client_id: string; client_secret?: string; redirect_uri?: string }) =>
    api<GoogleIntegration>("/api/integrations/google", { method: "PUT", body }),
  googleStatus: () => api<{ configured: boolean }>("/api/integrations/google/status"),
};

// ---- Invite codes (admin) ----
export const inviteApi = {
  list: () => api<InviteCode[]>("/api/auth/invite-codes"),
  create: (expires_in_days: number | null) =>
    api<InviteCode>("/api/auth/invite-codes", { method: "POST", body: { expires_in_days } }),
  remove: (id: number) => api<void>(`/api/auth/invite-codes/${id}`, { method: "DELETE" }),
};
