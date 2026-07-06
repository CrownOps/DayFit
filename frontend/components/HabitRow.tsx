"use client";

import type { Habit, HabitLog } from "@/lib/types";
import { timeLabel } from "@/lib/dates";
import { clsx } from "@/lib/clsx";

export function HabitRow({
  habit,
  log,
  date,
  onToggle,
}: {
  habit: Habit;
  log?: HabitLog;
  date: Date;
  onToggle: () => void;
}) {
  const completed = log?.completed ?? false;
  const streak = log?.streak_count ?? 0;

  // "Missed" = a scheduled habit whose target time has passed today and is unchecked.
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const [th, tm] = habit.target_time.split(":").map(Number);
  const passed = isToday && (now.getHours() > th || (now.getHours() === th && now.getMinutes() >= tm));
  const missed = !completed && passed;

  return (
    <div className="flex items-center gap-3 p-3">
      <button
        onClick={onToggle}
        aria-label={completed ? "완료 취소" : "완료"}
        className={clsx(
          "h-6 w-6 shrink-0 rounded-md border-2 grid place-items-center transition-colors",
          completed ? "bg-success border-success text-white" : "border-border hover:border-accent"
        )}
      >
        {completed && <span className="text-sm leading-none">✓</span>}
      </button>

      <div className="flex-1 min-w-0">
        <div
          className={clsx(
            "text-sm truncate",
            completed ? "text-text-secondary line-through" : missed ? "text-danger" : "text-text-primary"
          )}
        >
          {habit.name}
          {missed && <span className="ml-1 text-xs">⚠ 놓침</span>}
        </div>
        <div className="text-xs font-mono text-text-tertiary">{timeLabel(habit.target_time)}</div>
      </div>

      {streak > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full bg-accent-secondary px-2 py-0.5 text-xs font-medium font-mono text-white">
          🔥 {streak}
        </span>
      )}
    </div>
  );
}
