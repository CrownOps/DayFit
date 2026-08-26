// Mirrors the FastAPI backend schemas.

export interface User {
  id: number;
  email: string;
  name: string;
  is_admin: boolean;
  team_id: string;
  google_calendar_connected: boolean;
  gmail_connected: boolean;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface MyGoogleIntegration {
  configured: boolean;
  client_id: string | null;
  has_secret: boolean;
  suggested_callback_url: string;
}

export interface InviteCode {
  id: number;
  code: string;
  team_id: string;
  used_by_user_id: number | null;
  used_at: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface CalendarEvent {
  id: number;
  google_event_id: string | null;
  title: string;
  description: string | null;
  location: string | null;
  start_at: string;
  end_at: string;
  reminder_minutes_before: number | null;
  source: string;
  // From an invited/shared Google calendar the user can only read — shown but not editable.
  read_only?: boolean;
  // "habit" marks a daily-routine block injected into the timetable (not a real event).
  kind?: "event" | "habit";
}

export interface EventInput {
  title: string;
  description?: string | null;
  location?: string | null;
  start_at: string;
  end_at: string;
  reminder_minutes_before?: number | null;
}

export interface Habit {
  id: number;
  name: string;
  category: string;
  repeat_days: string;
  target_time: string;
  active: boolean;
}

export interface HabitLog {
  id: number;
  habit_id: number;
  date: string;
  completed: boolean;
  streak_count: number;
}

export interface HabitStats {
  habit_id: number;
  month: string;
  total_days: number;
  completed_days: number;
  completion_rate: number;
}

export interface Snippet {
  id: number;
  user_id: number;
  author: { id: number; name: string; email: string | null } | null;
  date: string;
  content: string;
  condition_score: number | null;
  ai_score: number | null;
  created_at: string;
  updated_at: string;
}

export interface HeatmapDay {
  date: string;
  written: boolean;
  condition_score: number | null;
}

export interface TeamHealthEntry {
  user_id: number;
  name: string;
  date: string | null;
  condition_score: number | null;
  has_snippet_today: boolean;
  content_preview: string | null;
}

export interface MeetingRoom {
  id: number;
  name: string;
  location: string | null;
  description: string | null;
  image_url: string | null;
}

export interface MeetingRoomReservation {
  id: number;
  meeting_room_id: number;
  reserved_by_user_id: number;
  reserved_by_name: string | null;
  start_at: string;
  end_at: string;
  purpose: string | null;
  can_cancel: boolean;
}

/** A day's reservations across every room, fetched in one request. */
export interface MeetingRoomReservationWithRoom extends MeetingRoomReservation {
  meeting_room_name: string | null;
}

export type EmailFolder = "inbox" | "sent";

export interface EmailSummary {
  id: string;
  thread_id: string;
  subject: string;
  from_: string;
  snippet: string;
  date: string;
  unread: boolean;
}

export interface EmailDetail extends EmailSummary {
  to_: string;
  body_text: string;
}

/** Which Google account the 이메일 page currently reads from. */
export interface GmailStatus {
  connected: boolean;
  email: string | null;
  // False until the user registers their own Google OAuth client in 설정.
  configured: boolean;
}

export interface EmailListOut {
  messages: EmailSummary[];
  next_page_token: string | null;
}

export interface RecurringReservationOccurrenceOut {
  id: number;
  occurrence_date: string;
  status: "booked" | "failed" | "cancelled";
  detail: string | null;
}

export interface RecurringReservationRule {
  id: number;
  meeting_room_id: number;
  weekday: number; // 0=Mon .. 6=Sun
  start_time: string; // "HH:MM:SS"
  end_time: string;
  purpose: string | null;
  starts_on: string;
  ends_on: string | null;
  active: boolean;
  occurrences: RecurringReservationOccurrenceOut[];
}

export interface RecurringReservationInput {
  meeting_room_id: number;
  weekday: number;
  start_time: string;
  end_time: string;
  purpose?: string | null;
  starts_on: string;
  ends_on?: string | null;
}

export interface PushSubscriptionRow {
  id: number;
  endpoint: string;
  device_label: string | null;
}

export type TaskScope = "today" | "week";
export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskView = "own" | "team";

export interface Task {
  id: number;
  title: string;
  // "team" marks an unclaimed shared-pool item; "event" is a task attached to a
  // calendar event that hasn't been promoted to "week" yet.
  scope: TaskScope | "team" | "event";
  anchor_date: string;
  status: TaskStatus;
  completed: boolean;
  sort_order: number;
  owner: { id: number; name: string } | null;
  // Set only on a claim record (a team-pool task that was 가져가기'd); ISO timestamp.
  claimed_at?: string | null;
  // Set when this task was created from a calendar event ("일정 할일").
  calendar_event_id?: number | null;
}

export type BookStatus = "want" | "reading" | "done";
export type BookScope = "own" | "team";

export interface Book {
  id: number;
  title: string;
  author: string;
  status: BookStatus;
  rating: number | null;
  review: string;
  owner: { id: number; name: string } | null;
  created_at: string;
  updated_at: string;
}

export interface TeamProfile {
  team_id: string;
  vision: string;
  mission: string;
}

/** "admin" = 관리자만 수정, "member" = 팀원 전체 수정. */
export type TeamEditPolicy = "admin" | "member";

export interface TeamPermissions {
  rules_edit_policy: TeamEditPolicy;
  profile_edit_policy: TeamEditPolicy;
  // What the current user may do under those policies (admins always may).
  can_edit_rules: boolean;
  can_edit_profile: boolean;
  is_admin: boolean;
}

export interface TeamRule {
  id: number;
  content: string;
  sort_order: number;
}

export interface BookInput {
  title: string;
  author?: string;
  status?: BookStatus;
  rating?: number | null;
  review?: string;
}

export interface PersonRef {
  id: number;
  name: string;
}

export type BottleneckPriority = "high" | "medium" | "low";
export type BottleneckStatus = "open" | "in_progress" | "resolved";

export interface BottleneckAction {
  id: number;
  bottleneck_id: number;
  content: string;
  effect: string;
  done: boolean;
  creator: PersonRef | null;
  created_at: string;
  updated_at: string;
}

export interface Bottleneck {
  id: number;
  title: string;
  description: string;
  priority: BottleneckPriority;
  status: BottleneckStatus;
  occurred_at: string;
  deadline: string | null;
  creator: PersonRef | null;
  actions: BottleneckAction[];
  created_at: string;
  updated_at: string;
}

export interface BottleneckInput {
  title: string;
  description?: string;
  priority?: BottleneckPriority;
  status?: BottleneckStatus;
  occurred_at?: string | null;
  deadline?: string | null;
}
