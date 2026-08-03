"use client";

import { useCallback, useEffect, useState } from "react";
import { calendarApi, habitsApi, tasksApi } from "@/lib/resources";
import type { CalendarEvent, Habit, HabitLog, Task } from "@/lib/types";
import {
  addDays,
  addMonths,
  endOfDay,
  isoDate,
  koreanDate,
  monthGrid,
  startOfDay,
  startOfWeek,
} from "@/lib/dates";
import { ApiError } from "@/lib/api";
import { Button, Card, ErrorAlert, Input, Label, Spinner, Textarea } from "@/components/ui";
import { Timetable } from "@/components/Timetable";
import { WeekTimetable } from "@/components/WeekTimetable";
import { MonthCalendar } from "@/components/MonthCalendar";
import { Modal } from "@/components/Modal";
import { HabitRow } from "@/components/HabitRow";
import { clsx } from "@/lib/clsx";

type ViewMode = "day" | "week" | "month";

// Daily-routine blocks default to a 30-minute slot in the timetable.
const HABIT_BLOCK_MINUTES = 30;

/** Whether a habit is scheduled on the given day (empty repeat_days = every day). */
function isHabitOnDay(h: Habit, d: Date): boolean {
  if (!h.active) return false;
  if (!h.repeat_days) return true;
  const weekday = (d.getDay() + 6) % 7; // 0=Mon
  return h.repeat_days.split(",").filter(Boolean).map(Number).includes(weekday);
}

/** Build read-only timetable blocks from scheduled habits across the given days. */
function habitBlocksForDays(habits: Habit[], days: Date[]): CalendarEvent[] {
  const blocks: CalendarEvent[] = [];
  for (const d of days) {
    for (const h of habits) {
      if (!isHabitOnDay(h, d)) continue;
      const [hh, mm] = h.target_time.split(":").map(Number);
      const start = new Date(d);
      start.setHours(hh || 0, mm || 0, 0, 0);
      const end = new Date(start.getTime() + HABIT_BLOCK_MINUTES * 60000);
      blocks.push({
        // Synthetic, stable-per-day negative id (won't collide with real events).
        id: -(h.id * 100 + d.getDate()),
        google_event_id: null,
        title: h.name,
        description: null,
        location: null,
        start_at: start.toISOString(),
        end_at: end.toISOString(),
        reminder_minutes_before: null,
        source: "habit",
        kind: "habit",
      });
    }
  }
  return blocks;
}

export default function TodayPage() {
  const [date, setDate] = useState(() => startOfDay(new Date()));
  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<Record<number, HabitLog>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);

  const day = isoDate(date);
  const weekStart = startOfWeek(date);
  const weekEnd = addDays(weekStart, 6);

  // Whether the current view (day/week/month) includes today, and a label for
  // the period being viewed — used by the date-nav "오늘" button so it reflects
  // the selected date instead of always reading "오늘".
  const now = new Date();
  const todayIso = isoDate(now);
  const isOnToday =
    viewMode === "day"
      ? day === todayIso
      : viewMode === "week"
        ? todayIso >= isoDate(weekStart) && todayIso <= isoDate(weekEnd)
        : date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  const periodLabel =
    viewMode === "month"
      ? `${date.getFullYear()}년 ${date.getMonth() + 1}월`
      : viewMode === "week"
        ? `${weekStart.getMonth() + 1}월 ${weekStart.getDate()}일 주`
        : koreanDate(date);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let rangeStart: Date;
      let rangeEnd: Date;
      if (viewMode === "month") {
        const grid = monthGrid(date);
        rangeStart = grid[0];
        rangeEnd = endOfDay(grid[grid.length - 1]);
      } else if (viewMode === "week") {
        rangeStart = startOfWeek(date);
        rangeEnd = endOfDay(addDays(startOfWeek(date), 6));
      } else {
        rangeStart = startOfDay(date);
        rangeEnd = endOfDay(date);
      }
      const [evs, hs, ls] = await Promise.all([
        calendarApi.listEvents(rangeStart.toISOString(), rangeEnd.toISOString()),
        habitsApi.list(),
        habitsApi.logs(day),
      ]);
      setEvents(evs);
      setHabits(hs);
      setLogs(Object.fromEntries(ls.map((l) => [l.habit_id, l])));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "불러오기에 실패했습니다");
    } finally {
      setLoading(false);
    }
  }, [date, day, viewMode]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleHabit(habit: Habit) {
    const current = logs[habit.id]?.completed ?? false;
    try {
      const updated = await habitsApi.setCompletion(habit.id, day, !current);
      setLogs((prev) => ({ ...prev, [habit.id]: updated }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "체크에 실패했습니다");
    }
  }

  const scheduledToday = habits.filter((h) => isHabitOnDay(h, date));

  // Daily routines rendered inside the timetable as read-only blocks. Day view
  // shows the selected day; week view shows every scheduled day. Month view is
  // left to real events only.
  const timetableEvents =
    viewMode === "month"
      ? events
      : [
          ...events,
          ...habitBlocksForDays(
            habits,
            viewMode === "week" ? Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)) : [date]
          ),
        ];

  return (
    <div className="space-y-6">
      {/* Date nav */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-text-primary">
            {viewMode === "month"
              ? `${date.getFullYear()}년 ${date.getMonth() + 1}월`
              : viewMode === "week"
                ? `${weekStart.getMonth() + 1}월 ${weekStart.getDate()}일 주`
                : isoDate(date) === isoDate(new Date())
                  ? "오늘"
                  : koreanDate(date)}
          </h1>
          <p className="text-sm text-text-secondary">
            {viewMode === "month"
              ? "월별 일정"
              : viewMode === "week"
                ? `${koreanDate(weekStart)} – ${koreanDate(weekEnd)}`
                : koreanDate(date)}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* day/week/month toggle */}
          <div className="inline-flex rounded-lg border border-border bg-surface p-0.5">
            {(["day", "week", "month"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                className={clsx(
                  "px-2.5 py-1 rounded-md text-sm transition-colors",
                  viewMode === m ? "bg-accent text-white" : "text-text-secondary"
                )}
              >
                {m === "day" ? "일" : m === "week" ? "주" : "월"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              onClick={() =>
                setDate((d) =>
                  viewMode === "month" ? addMonths(d, -1) : addDays(d, viewMode === "week" ? -7 : -1)
                )
              }
              aria-label="이전"
            >
              ‹
            </Button>
            <Button
              variant="ghost"
              onClick={() => setDate(startOfDay(new Date()))}
              title="오늘로 이동"
            >
              {isOnToday ? "오늘" : periodLabel}
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                setDate((d) =>
                  viewMode === "month" ? addMonths(d, 1) : addDays(d, viewMode === "week" ? 7 : 1)
                )
              }
              aria-label="다음"
            >
              ›
            </Button>
          </div>
        </div>
      </div>

      <ErrorAlert>{error}</ErrorAlert>

      {loading ? (
        <div className="grid place-items-center py-16">
          <Spinner className="h-8 w-8" />
        </div>
      ) : (
        <>
          {/* Timetable */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-text-primary">타임테이블</h2>
              <Button
                onClick={() => {
                  setEditing(null);
                  setModalOpen(true);
                }}
              >
                + 일정
              </Button>
            </div>
            {viewMode === "month" ? (
              <MonthCalendar
                month={date}
                events={events}
                onSelectEvent={(ev) => {
                  setEditing(ev);
                  setModalOpen(true);
                }}
                onSelectDay={(d) => {
                  setDate(startOfDay(d));
                  setViewMode("day");
                }}
              />
            ) : viewMode === "week" ? (
              <WeekTimetable
                weekStart={weekStart}
                events={timetableEvents}
                onSelect={(ev) => {
                  setEditing(ev);
                  setModalOpen(true);
                }}
              />
            ) : (
              <Timetable
                date={date}
                events={timetableEvents}
                onSelect={(ev) => {
                  setEditing(ev);
                  setModalOpen(true);
                }}
              />
            )}
          </section>

          {/* Habits — hidden in month view to keep the calendar focused */}
          {viewMode !== "month" && (
            <section className="space-y-3">
              <h2 className="text-base font-semibold text-text-primary">데일리 루틴</h2>
              <Card className="divide-y divide-border p-0">
                {scheduledToday.length === 0 ? (
                  <p className="p-4 text-sm text-text-tertiary">오늘 예정된 데일리 루틴이 없습니다.</p>
                ) : (
                  scheduledToday.map((h) => (
                    <HabitRow
                      key={h.id}
                      habit={h}
                      log={logs[h.id]}
                      date={date}
                      onToggle={() => toggleHabit(h)}
                    />
                  ))
                )}
              </Card>
            </section>
          )}
        </>
      )}

      <EventModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        event={editing}
        date={date}
        onSaved={() => {
          setModalOpen(false);
          load();
        }}
      />
    </div>
  );
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 16);
}

function EventModal({
  open,
  onClose,
  event,
  date,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  event: CalendarEvent | null;
  date: Date;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reminder, setReminder] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (event) {
      setTitle(event.title);
      setLocation(event.location ?? "");
      setDescription(event.description ?? "");
      setStart(toLocalInput(event.start_at));
      setEnd(toLocalInput(event.end_at));
      setReminder(event.reminder_minutes_before?.toString() ?? "");
    } else {
      const base = new Date(date);
      base.setHours(9, 0, 0, 0);
      const later = new Date(base);
      later.setHours(10, 0, 0, 0);
      setTitle("");
      setLocation("");
      setDescription("");
      setStart(toLocalInput(base.toISOString()));
      setEnd(toLocalInput(later.toISOString()));
      setReminder("10");
    }
    setError(null);
  }, [open, event, date]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        title,
        location: location || null,
        description: description || null,
        start_at: new Date(start).toISOString(),
        end_at: new Date(end).toISOString(),
        reminder_minutes_before: reminder ? Number(reminder) : null,
      };
      if (event) await calendarApi.update(event.id, payload);
      else await calendarApi.create(payload);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "저장에 실패했습니다");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!event) return;
    if (!confirm("이 일정을 삭제할까요?")) return;
    setSaving(true);
    try {
      await calendarApi.remove(event.id);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "삭제에 실패했습니다");
    } finally {
      setSaving(false);
    }
  }

  const readOnly = !!event?.read_only;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={readOnly ? "일정 (읽기 전용)" : event ? "일정 수정" : "새 일정"}
    >
      <form onSubmit={save} className="space-y-3">
        {readOnly && (
          <p className="rounded-lg border border-border bg-bg px-3 py-2 text-xs text-text-secondary">
            초대된(공유) Google 캘린더의 일정이라 여기서는 수정·삭제할 수 없습니다.
          </p>
        )}
        <div>
          <Label htmlFor="ev-title">제목</Label>
          <Input id="ev-title" value={title} onChange={(e) => setTitle(e.target.value)} required disabled={readOnly} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="ev-start">시작</Label>
            <Input id="ev-start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} required disabled={readOnly} />
          </div>
          <div>
            <Label htmlFor="ev-end">종료</Label>
            <Input id="ev-end" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} required disabled={readOnly} />
          </div>
        </div>
        <div>
          <Label htmlFor="ev-loc">장소</Label>
          <Input id="ev-loc" value={location} onChange={(e) => setLocation(e.target.value)} disabled={readOnly} />
        </div>
        <div>
          <Label htmlFor="ev-desc">설명</Label>
          <Textarea id="ev-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} disabled={readOnly} />
        </div>
        {!readOnly && (
          <div>
            <Label htmlFor="ev-rem">알림 (분 전)</Label>
            <Input
              id="ev-rem"
              type="number"
              min={0}
              value={reminder}
              onChange={(e) => setReminder(e.target.value)}
              placeholder="예: 10"
            />
          </div>
        )}
        {event && !readOnly && <EventTasksSection eventId={event.id} />}
        <ErrorAlert>{error}</ErrorAlert>
        <div className="flex items-center justify-between pt-2">
          {event && !readOnly ? (
            <Button type="button" variant="danger" onClick={remove} disabled={saving}>
              삭제
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              {readOnly ? "닫기" : "취소"}
            </Button>
            {!readOnly && (
              <Button type="submit" disabled={saving}>
                {saving ? <Spinner className="h-4 w-4 border-white/40 border-t-white" /> : "저장"}
              </Button>
            )}
          </div>
        </div>
      </form>
    </Modal>
  );
}

/** "일정 할일" — tasks attached to this event. New ones start hidden from the
 * 할 일 page (scope="event") until the user taps "이번주로 승격". */
function EventTasksSection({ eventId }: { eventId: number }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTasks(await tasksApi.byEvent(eventId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "일정 할일을 불러오지 못했습니다");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await tasksApi.createForEvent(title.trim(), eventId);
      setTitle("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "추가에 실패했습니다");
    } finally {
      setBusy(false);
    }
  }

  async function toggleDone(task: Task) {
    try {
      const updated = await tasksApi.update(task.id, { completed: task.status !== "done" });
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "변경에 실패했습니다");
    }
  }

  async function promote(task: Task) {
    try {
      const updated = await tasksApi.promoteToWeek(task.id);
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "승격에 실패했습니다");
    }
  }

  async function removeTask(task: Task) {
    try {
      await tasksApi.remove(task.id);
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "삭제에 실패했습니다");
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <Label>일정 할일</Label>
      {loading ? (
        <Spinner className="h-4 w-4" />
      ) : (
        <div className="space-y-1">
          {tasks.length === 0 && (
            <p className="text-xs text-text-tertiary">아직 등록된 할일이 없습니다.</p>
          )}
          {tasks.map((task) => (
            <div key={task.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={task.status === "done"}
                onChange={() => toggleDone(task)}
                className="accent-[var(--color-accent)]"
              />
              <span
                className={clsx(
                  "flex-1 min-w-0 truncate",
                  task.status === "done" ? "line-through text-text-tertiary" : "text-text-primary"
                )}
              >
                {task.title}
              </span>
              {task.scope === "event" ? (
                <button
                  type="button"
                  onClick={() => promote(task)}
                  className="shrink-0 text-xs text-accent hover:underline"
                >
                  이번주로 승격
                </button>
              ) : (
                <span className="shrink-0 text-xs text-text-tertiary">이번주 할일에 있음</span>
              )}
              <button
                type="button"
                onClick={() => removeTask(task)}
                className="shrink-0 text-text-tertiary hover:text-danger text-xs"
              >
                삭제
              </button>
            </div>
          ))}
        </div>
      )}
      <form onSubmit={addTask} className="flex gap-2 pt-1">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="새 할일 추가"
          className="flex-1"
        />
        <Button type="submit" variant="ghost" disabled={busy || !title.trim()}>
          추가
        </Button>
      </form>
      <ErrorAlert>{error}</ErrorAlert>
    </div>
  );
}
