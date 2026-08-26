"use client";

import Link from "next/link";
import type { Dashboard, DashboardSection } from "@/lib/types";
import { hhmm } from "@/lib/dates";
import { Card, Spinner } from "@/components/ui";
import { clsx } from "@/lib/clsx";

/**
 * 홈 위젯들. 각자 조회하지 않고 `/api/dashboard` 한 번의 결과를 나눠 받는다 —
 * 예전에는 위젯마다 따로 쏴서 홈을 열 때 요청이 9건 나갔고, vCPU 하나짜리
 * 인스턴스에서 서로 밀렸다.
 *
 * `data`가 null이면 아직 로딩 중이다. 구역이 실패한 경우는 값이 비어 있는 것과
 * 구분해야 해서(`"기록이 없습니다"` vs `"불러오지 못했습니다"`) `failed`를 본다.
 */
interface WidgetProps {
  data: Dashboard | null;
}

function failedIn(data: Dashboard | null, section: DashboardSection): boolean {
  return !!data?.failed.includes(section);
}

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
export function ScheduleWidget({ data }: WidgetProps) {
  const now = new Date();
  const upcoming = (data?.events ?? [])
    .filter((e) => new Date(e.end_at) >= now)
    .sort((a, b) => (a.start_at < b.start_at ? -1 : 1))
    .slice(0, 4);

  return (
    <WidgetShell title="오늘 일정" href="/today">
      {data === null ? (
        <Spinner className="h-5 w-5" />
      ) : failedIn(data, "events") ? (
        <p className="text-sm text-text-tertiary">일정을 불러오지 못했습니다.</p>
      ) : upcoming.length === 0 ? (
        <p className="text-sm text-text-tertiary">남은 일정이 없습니다.</p>
      ) : (
        <ul className="space-y-1.5">
          {upcoming.map((e) => (
            <li key={e.id} className="flex items-center gap-2 text-sm">
              <span className="shrink-0 font-mono text-xs text-text-secondary">
                {hhmm(e.start_at)}
              </span>
              <span className="truncate text-text-primary">{e.title}</span>
            </li>
          ))}
        </ul>
      )}
    </WidgetShell>
  );
}

/** Habit completion progress for today. */
export function HabitsWidget({ data }: WidgetProps) {
  const weekday = (new Date().getDay() + 6) % 7;
  const scheduled = (data?.habits ?? []).filter(
    (h) =>
      h.active &&
      (!h.repeat_days ||
        h.repeat_days.split(",").filter(Boolean).map(Number).includes(weekday))
  );
  const doneIds = new Set(
    (data?.habit_logs ?? []).filter((l) => l.completed).map((l) => l.habit_id)
  );
  const done = scheduled.filter((h) => doneIds.has(h.id)).length;
  const total = scheduled.length;
  const pct = total > 0 ? (done / total) * 100 : 0;

  return (
    <WidgetShell title="데일리 루틴" href="/habits">
      {data === null ? (
        <Spinner className="h-5 w-5" />
      ) : total === 0 ? (
        <p className="text-sm text-text-tertiary">오늘 예정된 데일리 루틴이 없습니다.</p>
      ) : (
        <>
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-secondary">완료</span>
            <span className="font-mono text-text-primary">
              {done}/{total}
            </span>
          </div>
          <div className="h-2 rounded-full bg-border overflow-hidden">
            <div
              className="h-full rounded-full bg-success transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </>
      )}
    </WidgetShell>
  );
}

/** Most recent snippet + its AI grading score. */
export function SnippetWidget({ data }: WidgetProps) {
  const latest = data?.latest_snippet ?? null;

  return (
    <WidgetShell title="스니펫" href="/snippets">
      {data === null ? (
        <Spinner className="h-5 w-5" />
      ) : failedIn(data, "snippet") ? (
        <p className="text-sm text-text-tertiary">GCS Pulse 연동이 필요합니다.</p>
      ) : latest === null ? (
        <p className="text-sm text-warning">작성된 스니펫이 없어요.</p>
      ) : (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-success">✓ 최근 기록</span>
          <span className="font-mono text-text-secondary">{latest.date}</span>
          {latest.ai_score !== null && (
            <span className="font-mono text-text-secondary">· AI 점수 {latest.ai_score}/100</span>
          )}
        </div>
      )}
    </WidgetShell>
  );
}

/** Team vision & mission. */
export function VisionWidget({ data }: WidgetProps) {
  const profile = data?.vision ?? null;
  const hasContent = !!(profile && (profile.vision || profile.mission));

  return (
    <WidgetShell title="팀 비전 · 미션" href="/team-space">
      {data === null ? (
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
export function TeamConditionWidget({ data }: WidgetProps) {
  const scored = (data?.team_health ?? []).filter((m) => m.condition_score !== null);
  const avg =
    scored.length === 0
      ? null
      : scored.reduce((a, m) => a + (m.condition_score ?? 0), 0) / scored.length;

  const pct = avg ? (avg / 10) * 100 : 0;
  const color =
    avg == null ? "bg-border" : avg >= 7 ? "bg-success" : avg >= 4 ? "bg-warning" : "bg-danger";

  return (
    <WidgetShell title="팀 컨디션" href="/team">
      {data === null ? (
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
            <div
              className={clsx("h-full rounded-full transition-all", color)}
              style={{ width: `${pct}%` }}
            />
          </div>
        </>
      )}
    </WidgetShell>
  );
}

/** Next upcoming meeting-room reservation today (across all rooms). */
export function RoomsWidget({ data }: WidgetProps) {
  const all = data?.room_reservations ?? [];
  const now = new Date();
  const next = all
    .filter((r) => new Date(r.end_at) > now)
    .sort((a, b) => a.start_at.localeCompare(b.start_at))[0];

  return (
    <WidgetShell title="회의실 예약" href="/rooms">
      {data === null ? (
        <Spinner className="h-5 w-5" />
      ) : failedIn(data, "rooms") ? (
        <p className="text-sm text-text-tertiary">회의실 정보를 불러올 수 없습니다.</p>
      ) : next ? (
        <div className="space-y-1">
          <div className="text-xs font-mono text-text-secondary">
            {hhmm(next.start_at)}–{hhmm(next.end_at)} · {next.meeting_room_name ?? "회의실"}
          </div>
          <div className="truncate text-sm text-text-primary">{next.purpose || "제목 없음"}</div>
        </div>
      ) : (
        <p className="text-sm text-text-tertiary">오늘 예정된 회의실 예약이 없습니다.</p>
      )}
    </WidgetShell>
  );
}
