"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { habitsApi } from "@/lib/resources";
import type { Habit, HabitLog, HabitStats } from "@/lib/types";
import { addDays, isoDate, timeLabel, WEEKDAY_LABELS } from "@/lib/dates";
import { ApiError } from "@/lib/api";
import { Button, Card, Input, Label, Spinner } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { Heatmap, type HeatCell } from "@/components/Heatmap";
import { clsx } from "@/lib/clsx";

/** Whether a habit is scheduled on a given weekday (0=Mon..6=Sun). */
function scheduledOn(habit: Habit, weekday: number): boolean {
  if (!habit.active) return false;
  if (!habit.repeat_days) return true; // no repeat_days => every day
  return habit.repeat_days.split(",").filter(Boolean).map(Number).includes(weekday);
}

export default function HabitsPage() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<Record<number, HabitLog>>({});
  const [rangeLogs, setRangeLogs] = useState<HabitLog[]>([]);
  const [stats, setStats] = useState<Record<number, HabitStats>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Habit | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const today = isoDate(new Date());
  const now = new Date();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rangeFrom = isoDate(addDays(new Date(), -118));
      const [hs, ls, rl] = await Promise.all([
        habitsApi.list(),
        habitsApi.logs(today),
        habitsApi.logsRange(rangeFrom, today),
      ]);
      setHabits(hs);
      setLogs(Object.fromEntries(ls.map((l) => [l.habit_id, l])));
      setRangeLogs(rl);
      const statEntries = await Promise.all(
        hs.map((h) => habitsApi.stats(h.id, now.getFullYear(), now.getMonth() + 1))
      );
      setStats(Object.fromEntries(statEntries.map((s) => [s.habit_id, s])));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "불러오기에 실패했습니다");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(habit: Habit) {
    const current = logs[habit.id]?.completed ?? false;
    try {
      const updated = await habitsApi.setCompletion(habit.id, today, !current);
      setLogs((p) => ({ ...p, [habit.id]: updated }));
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "체크에 실패했습니다");
    }
  }

  async function remove(habit: Habit) {
    if (!confirm(`'${habit.name}' 데일리 루틴을 삭제할까요?`)) return;
    try {
      await habitsApi.remove(habit.id);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "삭제에 실패했습니다");
    }
  }

  // Completion heatmap: darker = more of the day's scheduled routines done.
  const heatData = useMemo(() => {
    const completedByDate = new Map<string, Set<number>>();
    for (const l of rangeLogs) {
      if (!l.completed) continue;
      const set = completedByDate.get(l.date) ?? new Set<number>();
      set.add(l.habit_id);
      completedByDate.set(l.date, set);
    }

    const map: Record<string, HeatCell> = {};
    const start = addDays(new Date(), -118);
    for (let i = 0; i <= 118; i++) {
      const d = addDays(start, i);
      const iso = isoDate(d);
      const weekday = (d.getDay() + 6) % 7;
      const scheduled = habits.filter((h) => scheduledOn(h, weekday)).length;
      const completed = completedByDate.get(iso)?.size ?? 0;

      const denom = scheduled > 0 ? scheduled : completed;
      const ratio = denom > 0 ? Math.min(1, completed / denom) : 0;
      const level: HeatCell["level"] =
        completed === 0 ? 0 : ratio >= 1 ? 4 : ratio >= 0.66 ? 3 : ratio >= 0.33 ? 2 : 1;

      map[iso] = { level, title: `${iso} · ${completed}/${scheduled || completed} 완료` };
    }
    return map;
  }, [rangeLogs, habits]);

  const categories = Array.from(
    new Set(habits.map((h) => h.category).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, "ko"));
  const filtered =
    categoryFilter === "all"
      ? habits
      : categoryFilter === "none"
        ? habits.filter((h) => !h.category)
        : habits.filter((h) => h.category === categoryFilter);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text-primary">데일리 루틴</h1>
        <Button
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
        >
          + 데일리 루틴
        </Button>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {/* Category filter */}
      {categories.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { key: "all", label: "전체" },
            ...categories.map((c) => ({ key: c, label: c })),
            { key: "none", label: "미분류" },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setCategoryFilter(key)}
              className={clsx(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                categoryFilter === key
                  ? "bg-accent text-white"
                  : "bg-surface border border-border text-text-secondary hover:text-text-primary"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Completion heatmap */}
      {!loading && habits.length > 0 && (
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-primary">루틴 잔디</h2>
            <div className="flex items-center gap-1 text-xs text-text-tertiary">
              <span>적음</span>
              {[1, 2, 3, 4].map((l) => (
                <span
                  key={l}
                  className={clsx(
                    "h-3 w-3 rounded-sm inline-block",
                    ["bg-accent/25", "bg-accent/45", "bg-accent/70", "bg-accent"][l - 1]
                  )}
                />
              ))}
              <span>많음</span>
            </div>
          </div>
          <Heatmap data={heatData} />
          <p className="text-xs text-text-tertiary">
            매일 반복하며 그날 예정된 루틴을 많이 달성할수록 칸이 진해집니다.
          </p>
        </Card>
      )}

      {loading ? (
        <div className="grid place-items-center py-16">
          <Spinner className="h-8 w-8" />
        </div>
      ) : habits.length === 0 ? (
        <Card>
          <p className="text-sm text-text-tertiary">
            아직 등록된 데일리 루틴이 없습니다. 매일 반복할 데일리 루틴을 추가해보세요.
          </p>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <p className="text-sm text-text-tertiary">이 카테고리에 해당하는 데일리 루틴이 없습니다.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((h) => {
            const log = logs[h.id];
            const st = stats[h.id];
            const [th, tm] = h.target_time.split(":").map(Number);
            const passed = now.getHours() > th || (now.getHours() === th && now.getMinutes() >= tm);
            const missed = !log?.completed && passed;
            return (
              <Card key={h.id} className="space-y-3">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => toggle(h)}
                    className={clsx(
                      "h-6 w-6 shrink-0 rounded-md border-2 grid place-items-center transition-colors",
                      log?.completed
                        ? "bg-success border-success text-white"
                        : "border-border hover:border-accent"
                    )}
                  >
                    {log?.completed && <span className="text-sm leading-none">✓</span>}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className={clsx("text-sm font-medium", missed ? "text-danger" : "text-text-primary")}>
                      {h.name}
                      {!h.active && <span className="ml-2 text-xs text-text-tertiary">(비활성)</span>}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-text-tertiary">
                      {h.category && (
                        <span className="rounded-full bg-accent/10 text-accent px-1.5 py-0.5 font-medium">
                          {h.category}
                        </span>
                      )}
                      <span>
                        <span className="font-mono">{timeLabel(h.target_time)}</span> ·{" "}
                        {h.repeat_days
                          ? h.repeat_days
                              .split(",")
                              .filter(Boolean)
                              .map((d) => WEEKDAY_LABELS[Number(d)])
                              .join(" ")
                          : "매일"}
                      </span>
                    </div>
                  </div>
                  {(log?.streak_count ?? 0) > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-accent-secondary px-2 py-0.5 text-xs font-medium font-mono text-white">
                      🔥 {log?.streak_count}
                    </span>
                  )}
                  <button
                    onClick={() => {
                      setEditing(h);
                      setModalOpen(true);
                    }}
                    className="text-text-tertiary hover:text-text-primary text-sm px-1"
                  >
                    수정
                  </button>
                  <button
                    onClick={() => remove(h)}
                    className="text-text-tertiary hover:text-danger text-sm px-1"
                  >
                    삭제
                  </button>
                </div>

                {st && (
                  <div>
                    <div className="flex items-center justify-between text-xs text-text-secondary mb-1">
                      <span>{st.month} 완료율</span>
                      <span className="font-mono">
                        {st.completed_days}/{st.total_days} · {Math.round(st.completion_rate * 100)}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-border overflow-hidden">
                      <div
                        className="h-full bg-success rounded-full"
                        style={{ width: `${Math.round(st.completion_rate * 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <HabitModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        habit={editing}
        categories={categories}
        onSaved={() => {
          setModalOpen(false);
          load();
        }}
      />
    </div>
  );
}

function HabitModal({
  open,
  onClose,
  habit,
  categories,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  habit: Habit | null;
  categories: string[];
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [time, setTime] = useState("07:30");
  const [days, setDays] = useState<number[]>([]);
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (habit) {
      setName(habit.name);
      setCategory(habit.category ?? "");
      setTime(timeLabel(habit.target_time));
      setDays(habit.repeat_days ? habit.repeat_days.split(",").filter(Boolean).map(Number) : []);
      setActive(habit.active);
    } else {
      setName("");
      setCategory("");
      setTime("07:30");
      setDays([]);
      setActive(true);
    }
    setError(null);
  }, [open, habit]);

  function toggleDay(d: number) {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body = {
        name,
        category: category.trim(),
        target_time: `${time}:00`,
        repeat_days: days.join(","),
      };
      if (habit) await habitsApi.update(habit.id, { ...body, active });
      else await habitsApi.create(body);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "저장에 실패했습니다");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={habit ? "데일리 루틴 수정" : "새 데일리 루틴"}>
      <form onSubmit={save} className="space-y-3">
        <div>
          <Label htmlFor="h-name">이름</Label>
          <Input id="h-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <Label htmlFor="h-category">카테고리 (선택)</Label>
          <Input
            id="h-category"
            list="habit-categories"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="예: 건강, 학습, 운동"
          />
          <datalist id="habit-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div>
          <Label htmlFor="h-time">목표 시각</Label>
          <Input id="h-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
        </div>
        <div>
          <Label>반복 (선택 안 하면 매일)</Label>
          <div className="flex gap-1">
            {WEEKDAY_LABELS.map((label, i) => (
              <button
                key={i}
                type="button"
                onClick={() => toggleDay(i)}
                className={clsx(
                  "flex-1 rounded-md py-1.5 text-sm transition-colors",
                  days.includes(i)
                    ? "bg-accent text-white"
                    : "bg-bg border border-border text-text-secondary"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {habit && (
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            활성
          </label>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? <Spinner className="h-4 w-4 border-white/40 border-t-white" /> : "저장"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
