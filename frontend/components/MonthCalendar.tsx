"use client";

import type { CalendarEvent } from "@/lib/types";
import { hhmm, isoDate, monthGrid } from "@/lib/dates";
import { clsx } from "@/lib/clsx";

const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

// Event bars per week row before spilling into the "+n" counter.
const VISIBLE_LANES = 3;

/** Last calendar day an event covers — an end at exactly 00:00 belongs to the previous day. */
function lastCoveredDay(ev: CalendarEvent): string {
  const start = new Date(ev.start_at);
  let end = new Date(ev.end_at);
  if (end > start && end.getHours() === 0 && end.getMinutes() === 0) {
    end = new Date(end.getTime() - 1);
  }
  return end < start ? isoDate(start) : isoDate(end);
}

interface Segment {
  ev: CalendarEvent;
  col: number; // 0-6 within the week
  span: number;
  lane: number;
  startsHere: boolean; // event's first day falls in this week
  endsHere: boolean; // event's last day falls in this week
  tooltip: string;
}

interface WeekLayout {
  segments: Segment[];
  overflow: number[]; // hidden-event count per day column
}

/** Assign each event a horizontal bar (col/span/lane) per week row it covers. */
function layoutWeeks(cells: Date[], events: CalendarEvent[]): WeekLayout[] {
  const ranges = events
    .map((ev) => {
      const startIso = isoDate(new Date(ev.start_at));
      const endIso = lastCoveredDay(ev);
      const tooltip =
        endIso > startIso
          ? `${ev.title} (${startIso} ~ ${endIso})`
          : `${ev.title} ${hhmm(ev.start_at)}`;
      return { ev, startIso, endIso, tooltip };
    })
    // Earlier start first; among same start, longer event first so multi-day
    // bars take the top lanes and stay visually continuous across days.
    .sort((a, b) => {
      if (a.startIso !== b.startIso) return a.startIso < b.startIso ? -1 : 1;
      if (a.endIso !== b.endIso) return a.endIso > b.endIso ? -1 : 1;
      return a.ev.start_at < b.ev.start_at ? -1 : 1;
    });

  const weeks: WeekLayout[] = [];
  for (let w = 0; w < cells.length / 7; w++) {
    const days = cells.slice(w * 7, w * 7 + 7).map(isoDate);
    const occupied: boolean[][] = []; // [lane][col]
    const segments: Segment[] = [];
    const overflow = Array(7).fill(0) as number[];

    for (const { ev, startIso, endIso, tooltip } of ranges) {
      if (endIso < days[0] || startIso > days[6]) continue;
      const col = startIso <= days[0] ? 0 : days.indexOf(startIso);
      const endCol = endIso >= days[6] ? 6 : days.indexOf(endIso);

      let lane = 0;
      while (occupied[lane]?.slice(col, endCol + 1).some(Boolean)) lane++;
      occupied[lane] ??= Array(7).fill(false);
      for (let c = col; c <= endCol; c++) occupied[lane][c] = true;

      if (lane >= VISIBLE_LANES) {
        for (let c = col; c <= endCol; c++) overflow[c]++;
        continue;
      }
      segments.push({
        ev,
        col,
        span: endCol - col + 1,
        lane,
        startsHere: startIso >= days[0],
        endsHere: endIso <= days[6],
        tooltip,
      });
    }
    weeks.push({ segments, overflow });
  }
  return weeks;
}

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
  const weeks = layoutWeeks(cells, events);

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

      {/* 6 week rows; event bars overlay each row so they can span days */}
      {weeks.map((week, w) => (
        <div key={w} className="relative grid grid-cols-7">
          {cells.slice(w * 7, w * 7 + 7).map((d, i) => {
            const iso = isoDate(d);
            const inMonth = d.getMonth() === currentMonth;
            const isToday = iso === todayIso;
            return (
              <button
                key={iso}
                onClick={() => onSelectDay(d)}
                className={clsx(
                  "min-h-[104px] border-b border-r border-border p-1 text-left flex flex-col",
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
                {week.overflow[i] > 0 && (
                  <span className="mt-auto text-[10px] text-text-tertiary px-1">
                    +{week.overflow[i]}
                  </span>
                )}
              </button>
            );
          })}

          <div className="pointer-events-none absolute inset-x-0 top-7 grid grid-cols-7 auto-rows-[18px] gap-y-0.5">
            {week.segments.map((seg) => (
              <span
                key={seg.ev.id}
                style={{ gridColumn: `${seg.col + 1} / span ${seg.span}`, gridRow: seg.lane + 1 }}
                onClick={() => onSelectEvent(seg.ev)}
                title={seg.tooltip}
                className={clsx(
                  "pointer-events-auto cursor-pointer truncate bg-cat-class/15 px-1",
                  "text-[10px] text-text-primary leading-[18px]",
                  "hover:bg-cat-class/25 transition-colors",
                  seg.startsHere ? "ml-0.5 rounded-l border-l-2 border-cat-class" : "",
                  seg.endsHere ? "mr-0.5 rounded-r" : ""
                )}
              >
                {seg.ev.title}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
