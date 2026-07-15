"use client";

import { useEffect, useMemo, useState } from "react";
import { tasksApi } from "@/lib/resources";
import type { Task } from "@/lib/types";
import { ApiError } from "@/lib/api";
import { Card, ErrorAlert, Spinner } from "@/components/ui";
import { StatusBadge } from "@/components/TaskStatus";

interface MemberTasks {
  id: number;
  name: string;
  today: Task[];
  week: Task[];
}

/** Read-only view of every teammate's tasks and progress for today + this week. */
export function TeamTasks() {
  const [today, setToday] = useState<Task[]>([]);
  const [week, setWeek] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [t, w] = await Promise.all([
          tasksApi.list("today", "team"),
          tasksApi.list("week", "team"),
        ]);
        if (!cancelled) {
          setToday(t);
          setWeek(w);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "불러오기에 실패했습니다");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const members = useMemo<MemberTasks[]>(() => {
    const map = new Map<number, MemberTasks>();
    const ensure = (t: Task): MemberTasks => {
      const id = t.owner?.id ?? t.id;
      let m = map.get(id);
      if (!m) {
        m = { id, name: t.owner?.name ?? "알 수 없음", today: [], week: [] };
        map.set(id, m);
      }
      return m;
    };
    for (const t of today) ensure(t).today.push(t);
    for (const t of week) ensure(t).week.push(t);
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }, [today, week]);

  if (loading) {
    return (
      <div className="grid place-items-center py-10">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (error) return <ErrorAlert>{error}</ErrorAlert>;

  if (members.length === 0) {
    return (
      <Card>
        <p className="text-sm text-text-tertiary">
          아직 팀원이 작성한 할 일이 없습니다. 팀에 소속되어 있는지 확인해 보세요.
        </p>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {members.map((m) => (
        <MemberCard key={m.id} member={m} />
      ))}
    </div>
  );
}

function MemberCard({ member }: { member: MemberTasks }) {
  const all = [...member.today, ...member.week];
  const done = all.filter((t) => t.status === "done").length;
  const pct = all.length > 0 ? Math.round((done / all.length) * 100) : 0;

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">{member.name}</h3>
        <span className="text-xs font-mono text-text-tertiary">
          {done}/{all.length} · {pct}%
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-border overflow-hidden">
        <div className="h-full rounded-full bg-success transition-all" style={{ width: `${pct}%` }} />
      </div>

      <TaskGroup label="오늘" tasks={member.today} />
      <TaskGroup label="이번 주" tasks={member.week} />
    </Card>
  );
}

function TaskGroup({ label, tasks }: { label: string; tasks: Task[] }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-text-secondary">{label}</p>
      {tasks.length === 0 ? (
        <p className="text-xs text-text-tertiary py-0.5">없음</p>
      ) : (
        <ul className="space-y-1">
          {tasks.map((t) => (
            <li key={t.id} className="flex items-center gap-2">
              <StatusBadge status={t.status} />
              <span
                className={
                  t.status === "done"
                    ? "flex-1 min-w-0 text-sm break-words text-text-tertiary line-through"
                    : "flex-1 min-w-0 text-sm break-words text-text-primary"
                }
              >
                {t.title}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
