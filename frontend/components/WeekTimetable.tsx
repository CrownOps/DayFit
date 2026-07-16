"use client";

import { useEffect, useState } from "react";
import type { CalendarEvent } from "@/lib/types";
import { addDays, hhmm, isoDate } from "@/lib/dates";
import { clsx } from "@/lib/clsx";

const START_HOUR = 6;
const END_HOUR = 24;
const HOUR_PX = 44;
const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

export function WeekTimetable({
  weekStart,
  events,
  onSelect,
}: {
  weekStart: Date;
  events: CalendarEvent[];
  onSelect: (event: CalendarEvent) => void;
}) {
  const todayIso = isoDate(new Date());
  const [nowTop, setNowTop] = useState<number | null>(null);

  useEffect(() => {
    const update = () => {
      const now = new Date();
      const mins = now.getHours() * 60 + now.getMinutes() - START_HOUR * 60;
      setNowTop((mins / 60) * HOUR_PX);
    };
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, []);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const hours: number[] = [];
  for (let h = START_HOUR; h <= END_HOUR; h++) hours.push(h);
  const totalHeight = (END_HOUR - START_HOUR) * HOUR_PX;

  // Events overlapping each day (multi-day events appear in every day column
  // they cover), clamped to that day's boundaries.
  const dayEventsFor = (d: Date) => {
    const dayStartMs = d.getTime();
    const dayEndMs = dayStartMs + 24 * 60 * 60000;
    return events
      .filter(
        (ev) =>
          new Date(ev.start_at).getTime() < dayEndMs && new Date(ev.end_at).getTime() > dayStartMs
      )
      .map((ev) => {
        const startMins = Math.max(0, (new Date(ev.start_at).getTime() - dayStartMs) / 60000);
        const endMins = Math.min(24 * 60, (new Date(ev.end_at).getTime() - dayStartMs) / 60000);
        return { ev, startMins, endMins };
      });
  };

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      {/* Day header */}
      <div className="flex border-b border-border">
        <div className="w-12 shrink-0" />
        {days.map((d) => {
          const iso = isoDate(d);
          const isToday = iso === todayIso;
          return (
            <div
              key={iso}
              className={clsx(
                "flex-1 text-center py-2 text-xs border-l border-border",
                isToday ? "text-accent font-semibold" : "text-text-secondary"
              )}
            >
              <div>{DAY_LABELS[(d.getDay() + 6) % 7]}</div>
              <div className={clsx("font-mono", isToday && "text-accent")}>{d.getDate()}</div>
            </div>
          );
        })}
      </div>

      {/* Grid body */}
      <div className="relative overflow-y-auto max-h-[60vh]">
        <div className="relative flex" style={{ height: totalHeight }}>
          {/* Hour gutter */}
          <div className="w-12 shrink-0 relative">
            {hours.map((h, i) => (
              <div
                key={h}
                className="absolute right-1 -mt-1.5 text-[10px] font-mono text-text-tertiary"
                style={{ top: i * HOUR_PX }}
              >
                {String(h % 24).padStart(2, "0")}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((d) => {
            const iso = isoDate(d);
            const isToday = iso === todayIso;
            const dayEvents = dayEventsFor(d);
            return (
              <div key={iso} className="flex-1 relative border-l border-border">
                {/* hour lines */}
                {hours.map((h, i) => (
                  <div
                    key={h}
                    className="absolute left-0 right-0 border-t border-border/60"
                    style={{ top: i * HOUR_PX }}
                  />
                ))}

                {/* now line on today */}
                {isToday && nowTop !== null && nowTop >= 0 && nowTop <= totalHeight && (
                  <div className="absolute left-0 right-0 z-10 h-px bg-accent" style={{ top: nowTop }}>
                    <div className="absolute -left-0.5 -top-1 h-2 w-2 rounded-full bg-accent" />
                  </div>
                )}

                {/* events (and injected daily-routine blocks) */}
                {dayEvents.map(({ ev, startMins, endMins }) => {
                  if (endMins <= startMins) return null;
                  const top = ((startMins - START_HOUR * 60) / 60) * HOUR_PX;
                  const height = Math.max(((endMins - startMins) / 60) * HOUR_PX, 16);
                  if (top > totalHeight || top + height < 0) return null;

                  if (ev.kind === "habit") {
                    return (
                      <div
                        key={`h-${ev.id}`}
                        title={`${ev.title} · 루틴 ${hhmm(ev.start_at)}`}
                        className="absolute left-0.5 right-0.5 z-[5] rounded border-l-2 border-dashed bg-cat-habit/15 border-cat-habit px-1 py-0.5 overflow-hidden"
                        style={{ top, height }}
                      >
                        <div className="text-[10px] font-medium text-text-primary truncate leading-tight">
                          <span className="text-cat-habit">◌ </span>
                          {ev.title}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <button
                      key={ev.id}
                      onClick={() => onSelect(ev)}
                      title={`${ev.title} ${hhmm(ev.start_at)}–${hhmm(ev.end_at)}`}
                      className="absolute left-0.5 right-0.5 z-[5] rounded border-l-2 bg-cat-class/15 border-cat-class px-1 py-0.5 text-left overflow-hidden hover:bg-cat-class/25 transition-colors"
                      style={{ top, height }}
                    >
                      <div className="text-[10px] font-medium text-text-primary truncate leading-tight">
                        {ev.title}
                      </div>
                      {height > 26 && (
                        <div className="text-[9px] font-mono text-text-secondary truncate">
                          {hhmm(ev.start_at)}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
