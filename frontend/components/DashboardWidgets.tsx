"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { calendarApi, habitsApi, snippetsApi, teamApi, teamSpaceApi, tokenApi } from "@/lib/resources";
import type { CalendarEvent, TeamProfile } from "@/lib/types";
import { addDays, endOfDay, hhmm, isoDate, startOfDay } from "@/lib/dates";
import { Card, Spinner } from "@/components/ui";
import { clsx } from "@/lib/clsx";

function WidgetShell({
  title,
  href,
  children,
}: {
  title: string;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="space-y-3 flex flex-col">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
        <Link href={href} className="text-xs text-accent hover:underline">
          전체 →
        </Link>
      </div>
      {children}
    </Card>
  );
}

/** Next events today. */
export function ScheduleWidget() {
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);

  useEffect(() => {
    const now = new Date();
    calendarApi
      .listEvents(startOfDay(now).toISOString(), endOfDay(now).toISOString())
      .then(setEvents)
      .catch(() => setEvents([]));
  }, []);

  const now = new Date();
  const upcoming = (events ?? [])
    .filter((e) => new Date(e.end_at) >= now)
    .sort((a, b) => (a.start_at < b.start_at ? -1 : 1))
    .slice(0, 4);

  return (
    <WidgetShell title="오늘 일정" href="/today">
      {events === null ? (
        <Spinner className="h-5 w-5" />
      ) : upcoming.length === 0 ? (
        <p className="text-sm text-text-tertiary">남은 일정이 없습니다.</p>
      ) : (
        <ul className="space-y-1.5">
          {upcoming.map((e) => (
            <li key={e.id} className="flex items-center gap-2 text-sm">
              <span className="font-mono text-xs text-text-secondary w-11 shrink-0">
                {hhmm(e.start_at)}
              </span>
              <span className="h-3 w-0.5 rounded bg-cat-class shrink-0" />
              <span className="truncate text-text-primary">{e.title}</span>
            </li>
          ))}
        </ul>
      )}
    </WidgetShell>
  );
}

/** Habit completion progress for today. */
export function HabitsWidget() {
  const [data, setData] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    const today = isoDate(new Date());
    const weekday = (new Date().getDay() + 6) % 7;
    Promise.all([habitsApi.list(), habitsApi.logs(today)])
      .then(([habits, logs]) => {
        const scheduled = habits.filter(
          (h) =>
            h.active &&
            (!h.repeat_days ||
              h.repeat_days.split(",").filter(Boolean).map(Number).includes(weekday))
        );
        const doneIds = new Set(logs.filter((l) => l.completed).map((l) => l.habit_id));
        const done = scheduled.filter((h) => doneIds.has(h.id)).length;
        setData({ done, total: scheduled.length });
      })
      .catch(() => setData({ done: 0, total: 0 }));
  }, []);

  const pct = data && data.total > 0 ? (data.done / data.total) * 100 : 0;

  return (
    <WidgetShell title="데일리 루틴" href="/habits">
      {data === null ? (
        <Spinner className="h-5 w-5" />
      ) : data.total === 0 ? (
        <p className="text-sm text-text-tertiary">오늘 예정된 데일리 루틴이 없습니다.</p>
      ) : (
        <>
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-secondary">완료</span>
            <span className="font-mono text-text-primary">
              {data.done}/{data.total}
            </span>
          </div>
          <div className="h-2 rounded-full bg-border overflow-hidden">
            <div className="h-full rounded-full bg-success transition-all" style={{ width: `${pct}%` }} />
          </div>
        </>
      )}
    </WidgetShell>
  );
}

/** Most recent snippet + its AI grading score. */
export function SnippetWidget() {
  const [state, setState] = useState<
    { latest: { date: string; score: number | null } | null } | null
  >(null);

  useEffect(() => {
    const to = isoDate(new Date());
    const from = isoDate(addDays(new Date(), -140));
    snippetsApi
      .list("own", from, to)
      .then((list) => {
        // Most recent record by date (list order isn't guaranteed).
        const latest = list.reduce<(typeof list)[number] | null>(
          (acc, s) => (acc === null || s.date > acc.date ? s : acc),
          null
        );
        setState({
          latest: latest ? { date: latest.date, score: latest.ai_score } : null,
        });
      })
      .catch(() => setState(null));
  }, []);

  return (
    <WidgetShell title="스니펫" href="/snippets">
      {state === null ? (
        <p className="text-sm text-text-tertiary">GCS Pulse 연동이 필요합니다.</p>
      ) : state.latest === null ? (
        <p className="text-sm text-warning">작성된 스니펫이 없어요.</p>
      ) : (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-success">✓ 최근 기록</span>
          <span className="font-mono text-text-secondary">{state.latest.date}</span>
          {state.latest.score !== null && (
            <span className="font-mono text-text-secondary">· AI 점수 {state.latest.score}/100</span>
          )}
        </div>
      )}
    </WidgetShell>
  );
}

/** Team vision & mission. */
export function VisionWidget() {
  const [profile, setProfile] = useState<TeamProfile | null | undefined>(undefined);

  useEffect(() => {
    teamSpaceApi
      .profile()
      .then(setProfile)
      .catch(() => setProfile(null));
  }, []);

  const hasContent = !!(profile && (profile.vision || profile.mission));

  return (
    <WidgetShell title="팀 비전 · 미션" href="/team-space">
      {profile === undefined ? (
        <Spinner className="h-5 w-5" />
      ) : !hasContent ? (
        <p className="text-sm text-text-tertiary">아직 등록된 비전/미션이 없습니다.</p>
      ) : (
        <div className="space-y-2">
          {profile!.vision && (
            <div>
              <div className="text-xs font-medium text-accent">비전</div>
              <p className="text-sm text-text-primary whitespace-pre-wrap break-words line-clamp-3">
                {profile!.vision}
              </p>
            </div>
          )}
          {profile!.mission && (
            <div>
              <div className="text-xs font-medium text-accent-secondary">미션</div>
              <p className="text-sm text-text-primary whitespace-pre-wrap break-words line-clamp-3">
                {profile!.mission}
              </p>
            </div>
          )}
        </div>
      )}
    </WidgetShell>
  );
}

/** Team average condition. */
export function TeamConditionWidget() {
  const [avg, setAvg] = useState<number | null | undefined>(undefined);

  useEffect(() => {
    teamApi
      .health()
      .then((h) => {
        const scored = h.filter((m) => m.condition_score !== null);
        setAvg(
          scored.length === 0
            ? null
            : scored.reduce((a, m) => a + (m.condition_score ?? 0), 0) / scored.length
        );
      })
      .catch(() => setAvg(null));
  }, []);

  const pct = avg ? (avg / 10) * 100 : 0;
  const color = avg == null ? "bg-border" : avg >= 7 ? "bg-success" : avg >= 4 ? "bg-warning" : "bg-danger";

  return (
    <WidgetShell title="팀 컨디션" href="/team">
      {avg === undefined ? (
        <Spinner className="h-5 w-5" />
      ) : avg === null ? (
        <p className="text-sm text-text-tertiary">팀 헬스체크 기록이 없습니다.</p>
      ) : (
        <>
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-secondary">평균</span>
            <span className="font-mono text-text-primary">{avg.toFixed(1)}/10</span>
          </div>
          <div className="h-2 rounded-full bg-border overflow-hidden">
            <div className={clsx("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
          </div>
        </>
      )}
    </WidgetShell>
  );
}

/** GCS Pulse token quota gauge. */
export function TokenWidget() {
  const [q, setQ] = useState<{ used: number; allocated: number } | null | undefined>(undefined);

  useEffect(() => {
    tokenApi
      .quota()
      .then((quota) => setQ({ used: quota.used, allocated: quota.allocated }))
      .catch(() => setQ(null));
  }, []);

  const pct = q && q.allocated > 0 ? Math.min(100, (q.used / q.allocated) * 100) : 0;
  const color = pct >= 90 ? "bg-danger" : pct >= 70 ? "bg-warning" : "bg-success";

  return (
    <WidgetShell title="토큰 쿼터" href="/tokens">
      {q === undefined ? (
        <Spinner className="h-5 w-5" />
      ) : q === null ? (
        <p className="text-sm text-text-tertiary">토큰 쿼터를 불러올 수 없습니다.</p>
      ) : (
        <>
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-secondary font-mono text-xs">
              {q.used.toLocaleString()}/{q.allocated.toLocaleString()}
            </span>
            <span className="font-mono text-text-primary">{Math.round(pct)}%</span>
          </div>
          <div className="h-2 rounded-full bg-border overflow-hidden">
            <div className={clsx("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
          </div>
        </>
      )}
    </WidgetShell>
  );
}
