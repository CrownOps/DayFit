"use client";

import { useEffect, useRef, useState } from "react";
import type { CalendarEvent } from "@/lib/types";
import { hhmm, minutesSinceMidnight, isoDate } from "@/lib/dates";
import { clsx } from "@/lib/clsx";

const START_HOUR = 6;
const END_HOUR = 24;
const HOUR_PX = 56;

function topFor(iso: string): number {
  const mins = minutesSinceMidnight(iso) - START_HOUR * 60;
  return (mins / 60) * HOUR_PX;
}

export function Timetable({
  date,
  events,
  onSelect,
}: {
  date: Date;
  events: CalendarEvent[];
  onSelect: (event: CalendarEvent) => void;
}) {
  const isToday = isoDate(date) === isoDate(new Date());
  const [nowTop, setNowTop] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isToday) {
      setNowTop(null);
      return;
    }
    const update = () => {
      const now = new Date();
      const mins = now.getHours() * 60 + now.getMinutes() - START_HOUR * 60;
      setNowTop((mins / 60) * HOUR_PX);
    };
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, [isToday, date]);

  const hours = [];
  for (let h = START_HOUR; h <= END_HOUR; h++) hours.push(h);

  const totalHeight = (END_HOUR - START_HOUR) * HOUR_PX;

  return (
    <div ref={scrollRef} className="relative overflow-y-auto max-h-[65vh] rounded-xl border border-border bg-surface">
      <div className="relative" style={{ height: totalHeight }}>
        {/* Hour grid */}
        {hours.map((h, i) => (
          <div
            key={h}
            className="absolute left-0 right-0 flex"
            style={{ top: i * HOUR_PX, height: HOUR_PX }}
          >
            <div className="w-14 shrink-0 text-right pr-2 -mt-2 text-xs font-mono text-text-tertiary">
              {h < 24 ? `${String(h).padStart(2, "0")}:00` : "24:00"}
            </div>
            <div className="flex-1 border-t border-border" />
          </div>
        ))}

        {/* Now line */}
        {nowTop !== null && nowTop >= 0 && nowTop <= totalHeight && (
          <div className="absolute left-14 right-2 z-10 flex items-center" style={{ top: nowTop }}>
            <div className="h-2 w-2 rounded-full bg-accent -ml-1" />
            <div className="flex-1 h-px bg-accent" />
          </div>
        )}

        {/* Events */}
        {events.map((ev) => {
          const top = topFor(ev.start_at);
          const bottom = topFor(ev.end_at);
          const height = Math.max(bottom - top, 22);
          if (top > totalHeight || bottom < 0) return null;
          return (
            <button
              key={ev.id}
              onClick={() => onSelect(ev)}
              className={clsx(
                "absolute left-16 right-2 z-[5] rounded-lg border-l-4 px-2 py-1 text-left overflow-hidden",
                "bg-cat-class/10 border-cat-class hover:bg-cat-class/20 transition-colors"
              )}
              style={{ top, height }}
            >
              <div className="text-xs font-medium text-text-primary truncate">{ev.title}</div>
              <div className="text-[10px] font-mono text-text-secondary">
                {hhmm(ev.start_at)}–{hhmm(ev.end_at)}
                {ev.location ? ` · ${ev.location}` : ""}
              </div>
            </button>
          );
        })}

        {events.length === 0 && (
          <div className="absolute left-16 right-2 top-4 text-sm text-text-tertiary">
            등록된 일정이 없습니다. 여유로운 하루예요.
          </div>
        )}
      </div>
    </div>
  );
}
