"use client";

import { addDays, isoDate } from "@/lib/dates";
import { clsx } from "@/lib/clsx";

export interface HeatCell {
  level: 0 | 1 | 2 | 3 | 4;
  title: string;
}

/**
 * Map a health-check condition score (1–10) to a heat intensity level.
 * Intensity reflects the *score*, not how many snippets exist — higher
 * condition = darker cell. A written snippet with no score stays faint (1).
 */
export function conditionLevel(score: number | null): HeatCell["level"] {
  if (score === null) return 1;
  if (score >= 9) return 4;
  if (score >= 7) return 3;
  if (score >= 4) return 2;
  return 1;
}

/**
 * Map an AI grading score (0–100, from a snippet's `feedback.total_score`) to a
 * heat intensity level. Higher AI score = darker cell. A snippet that exists but
 * hasn't been scored yet stays faint (1).
 */
export function aiScoreLevel(score: number | null): HeatCell["level"] {
  if (score === null) return 1;
  if (score >= 85) return 4;
  if (score >= 70) return 3;
  if (score >= 50) return 2;
  return 1;
}

const LEVEL_CLASS = [
  "bg-border", // 0 — no entry
  "bg-accent/25",
  "bg-accent/45",
  "bg-accent/70",
  "bg-accent",
];

/**
 * GitHub-style contribution grid.
 * `data` maps YYYY-MM-DD -> { level, title }. Renders the last `weeks` weeks
 * ending on the week containing today, with weekday rows (Mon..Sun).
 */
export function Heatmap({
  data,
  weeks = 17,
}: {
  data: Record<string, HeatCell>;
  weeks?: number;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = isoDate(today);

  // Find the Monday of the current week.
  const dayOfWeekMon = (today.getDay() + 6) % 7; // 0=Mon
  const thisMonday = addDays(today, -dayOfWeekMon);
  const startMonday = addDays(thisMonday, -(weeks - 1) * 7);

  const columns: { date: Date; iso: string }[][] = [];
  for (let w = 0; w < weeks; w++) {
    const col: { date: Date; iso: string }[] = [];
    for (let d = 0; d < 7; d++) {
      const date = addDays(startMonday, w * 7 + d);
      col.push({ date, iso: isoDate(date) });
    }
    columns.push(col);
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-1">
        {columns.map((col, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {col.map(({ date, iso }) => {
              const cell = data[iso];
              const level = cell?.level ?? 0;
              const future = iso > todayIso;
              const isToday = iso === todayIso;
              return (
                <div
                  key={iso}
                  title={cell?.title ?? `${iso} · 미작성`}
                  className={clsx(
                    "h-3 w-3 rounded-sm",
                    future ? "opacity-0" : LEVEL_CLASS[level],
                    isToday && "ring-1 ring-accent-secondary"
                  )}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
