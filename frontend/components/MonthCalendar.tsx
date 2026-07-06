"use client";

import type { CalendarEvent } from "@/lib/types";
import { hhmm, isoDate, monthGrid } from "@/lib/dates";
import { clsx } from "@/lib/clsx";

const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

export function MonthCalendar({
  month,
  events,
  onSelectEvent,
  onSelectDay,
}: {
  month: Date;
  events: CalendarEvent[];
  onSelectEvent: (event: CalendarEvent) => void;
  onSelectDay: (date: Date) => void;
}) {
  const todayIso = isoDate(new Date());
  const cells = monthGrid(month);
  const currentMonth = month.getMonth();

  const byDay: Record<string, CalendarEvent[]> = {};
  for (const ev of events) {
    const key = isoDate(new Date(ev.start_at));
    (byDay[key] ??= []).push(ev);
  }
  for (const list of Object.values(byDay)) {
    list.sort((a, b) => (a.start_at < b.start_at ? -1 : 1));
  }

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      {/* weekday header */}
      <div className="grid grid-cols-7 border-b border-border">
        {DAY_LABELS.map((l, i) => (
          <div
            key={l}
            className={clsx(
              "py-2 text-center text-xs font-medium",
              i >= 5 ? "text-text-tertiary" : "text-text-secondary"
            )}
          >
            {l}
          </div>
        ))}
      </div>

      {/* 6 weeks */}
      <div className="grid grid-cols-7">
        {cells.map((d) => {
          const iso = isoDate(d);
          const inMonth = d.getMonth() === currentMonth;
          const isToday = iso === todayIso;
          const dayEvents = byDay[iso] ?? [];
          return (
            <button
              key={iso}
              onClick={() => onSelectDay(d)}
              className={clsx(
                "min-h-[76px] border-b border-r border-border p-1 text-left align-top flex flex-col gap-0.5",
                "hover:bg-bg transition-colors",
                !inMonth && "opacity-40"
              )}
            >
              <span
                className={clsx(
                  "text-xs font-mono self-start rounded px-1",
                  isToday ? "bg-accent text-white" : "text-text-secondary"
                )}
              >
                {d.getDate()}
              </span>
              <div className="flex flex-col gap-0.5 overflow-hidden">
                {dayEvents.slice(0, 3).map((ev) => (
                  <span
                    key={ev.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectEvent(ev);
                    }}
                    className="truncate rounded bg-cat-class/15 border-l-2 border-cat-class px-1 text-[10px] text-text-primary leading-tight cursor-pointer"
                    title={`${ev.title} ${hhmm(ev.start_at)}`}
                  >
                    {ev.title}
                  </span>
                ))}
                {dayEvents.length > 3 && (
                  <span className="text-[10px] text-text-tertiary px-1">+{dayEvents.length - 3}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
