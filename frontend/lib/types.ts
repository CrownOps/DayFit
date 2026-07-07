// Mirrors the FastAPI backend schemas.

export interface User {
  id: number;
  email: string;
  name: string;
  is_admin: boolean;
  team_id: string;
  google_calendar_connected: boolean;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
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

export interface GcsPulseQuota {
  allocated: number;
  used: number;
  remaining: number;
  last_reset: string;
  next_reset: string;
}

export interface TokenUsageLog {
  id: number;
  user_id: number;
  date: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
  source: string;
}

export interface PushSubscriptionRow {
  id: number;
  endpoint: string;
  device_label: string | null;
}

export type TaskScope = "today" | "week";

export interface Task {
  id: number;
  title: string;
  scope: TaskScope;
  anchor_date: string;
  completed: boolean;
  sort_order: number;
}
