"use client";

import { useEffect, useMemo, useState } from "react";
import { tasksApi } from "@/lib/resources";
import type { Task } from "@/lib/types";
import { Spinner } from "@/components/ui";
import { StatusBadge } from "@/components/TaskStatus";
import { clsx } from "@/lib/clsx";

/**
 * Reference panel shown next to the snippet write box: lists the user's 완료 /
 * 진행 중 tasks (today + this week) so they can pull them into the snippet while
 * writing. Each item can be inserted individually, or all of a group at once.
 */
export function SnippetTasks({ onInsert }: { onInsert: (text: string) => void }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [today, week] = await Promise.all([
          tasksApi.list("today", "own"),
          tasksApi.list("week", "own"),
        ]);
        if (!cancelled) setTasks([...today, ...week]);
      } catch {
        if (!cancelled) setTasks([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const done = useMemo(() => tasks.filter((t) => t.status === "done"), [tasks]);
  const inProgress = useMemo(() => tasks.filter((t) => t.status === "in_progress"), [tasks]);

  const hasAny = done.length > 0 || inProgress.length > 0;

  // Writing about a task in today's snippet means it's being worked on today,
  // so referencing a "week" task here also promotes it into 오늘 할 일.
  async function promoteToToday(t: Task) {
    if (t.scope === "today") return;
    try {
      await tasksApi.update(t.id, { scope: "today" });
      setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, scope: "today" } : x)));
    } catch {
      /* best-effort — the snippet insert itself should still succeed */
    }
  }

  function insertOne(t: Task) {
    promoteToToday(t);
    onInsert(`- ${t.title}\n`);
  }

  function insertAll() {
    for (const t of [...inProgress, ...done]) promoteToToday(t);
    onInsert(formatAll(done, inProgress));
  }

  return (
    <div className="rounded-lg border border-border bg-bg/50 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary hover:text-text-primary"
        >
          <span className="text-[10px]">{open ? "▾" : "▸"}</span>
          내 할 일 참고 {hasAny && `(완료 ${done.length} · 진행 ${inProgress.length})`}
        </button>
        {open && hasAny && (
          <button type="button" onClick={insertAll} className="text-xs font-medium text-accent hover:underline">
            전체 삽입
          </button>
        )}
      </div>

      {open && (
        <>
          {loading ? (
            <div className="grid place-items-center py-3">
              <Spinner className="h-4 w-4" />
            </div>
          ) : !hasAny ? (
            <p className="text-xs text-text-tertiary">완료/진행 중인 할 일이 없습니다.</p>
          ) : (
            <div className="space-y-2">
              <TaskGroup label="진행 중" tasks={inProgress} onInsert={insertOne} />
              <TaskGroup label="완료" tasks={done} onInsert={insertOne} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TaskGroup({
  label,
  tasks,
  onInsert,
}: {
  label: string;
  tasks: Task[];
  onInsert: (task: Task) => void;
}) {
  if (tasks.length === 0) return null;
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium text-text-tertiary">{label}</p>
      <ul className="space-y-1">
        {tasks.map((t) => (
          <li key={t.id} className="group flex items-center gap-2">
            <StatusBadge status={t.status} />
            <span
              className={clsx(
                "flex-1 min-w-0 text-sm break-words",
                t.status === "done" ? "text-text-tertiary line-through" : "text-text-primary"
              )}
            >
              {t.title}
            </span>
            <button
              type="button"
              onClick={() => onInsert(t)}
              className="shrink-0 rounded-md border border-border px-1.5 py-0.5 text-[11px] text-text-secondary hover:border-accent hover:text-accent transition-colors opacity-0 group-hover:opacity-100"
            >
              삽입
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatAll(done: Task[], inProgress: Task[]): string {
  const lines: string[] = [];
  if (inProgress.length > 0) {
    lines.push("### 진행 중");
    for (const t of inProgress) lines.push(`- ${t.title}`);
  }
  if (done.length > 0) {
    lines.push("### 완료");
    for (const t of done) lines.push(`- ${t.title}`);
  }
  return lines.join("\n") + "\n";
}
