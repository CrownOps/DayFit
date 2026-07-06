/** Local YYYY-MM-DD (not UTC). */
export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

export function endOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(23, 59, 59, 999);
  return c;
}

export function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

/** Monday 00:00 of the week containing `d`. */
export function startOfWeek(d: Date): Date {
  const c = startOfDay(d);
  const dow = (c.getDay() + 6) % 7; // 0=Mon
  return addDays(c, -dow);
}

export function startOfMonth(d: Date): Date {
  return startOfDay(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function endOfMonth(d: Date): Date {
  return endOfDay(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

/** 6x7 grid (Mon-first) covering the month containing `d`. */
export function monthGrid(d: Date): Date[] {
  const first = startOfMonth(d);
  const gridStart = startOfWeek(first);
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
}

export function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** "HH:MM:SS" or "HH:MM" -> "HH:MM" */
export function timeLabel(t: string): string {
  return t.slice(0, 5);
}

const KO_DAYS = ["일", "월", "화", "수", "목", "금", "토"];

export function koreanDate(d: Date): string {
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${KO_DAYS[d.getDay()]})`;
}

export function minutesSinceMidnight(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

export const WEEKDAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];
