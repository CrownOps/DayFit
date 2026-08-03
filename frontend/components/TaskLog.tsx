"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { tasksApi } from "@/lib/resources";
import type { Task } from "@/lib/types";
import { ApiError } from "@/lib/api";
import { Card, ErrorAlert, Spinner } from "@/components/ui";
import { StatusBadge } from "@/components/TaskStatus";
import { clsx } from "@/lib/clsx";

function groupLabel(scope: string, anchorDate: string): string {
  const d = new Date(`${anchorDate}T00:00:00`);
  const md = `${d.getMonth() + 1}월 ${d.getDate()}일`;
  return scope === "week" ? `${md} 주` : md;
}

/**
 * Read-only history of past 오늘/이번 주 tasks — the personal equivalent of the
 * "가져간 기록" log shown under 팀 할일. Collapsed and lazy-loaded by default
 * since a long-lived account can accumulate a lot of history.
 */
export function TaskLog() {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTasks(await tasksApi.log());
      setLoaded(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "불러오기에 실패했습니다");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && !loaded) load();
  }, [open, loaded, load]);

  const groups = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      const key = `${t.scope}:${t.anchor_date}`;
      const arr = map.get(key);
      if (arr) arr.push(t);
      else map.set(key, [t]);
    }
    return [...map.entries()].map(([key, items]) => {
      const [scope, anchorDate] = key.split(":");
      return { key, label: groupLabel(scope, anchorDate), items };
    });
  }, [tasks]);

  return (
    <Card className="space-y-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-text-tertiary" />
          <h2 className="text-sm font-semibold text-text-primary">로그</h2>
        </div>
        <span className="text-xs text-text-tertiary">{open ? "접기 ▾" : "펼치기 ▸"}</span>
      </button>

      {open && (
        <>
          <p className="text-xs text-text-tertiary">
            지난 오늘/이번 주 할 일 기록입니다. 현재 컬럼에 떠 있는 항목은 제외됩니다.
          </p>
          <ErrorAlert>{error}</ErrorAlert>
          {loading ? (
            <div className="grid place-items-center py-6">
              <Spinner className="h-5 w-5" />
            </div>
          ) : groups.length === 0 ? (
            <p className="text-sm text-text-tertiary py-1">아직 기록이 없습니다.</p>
          ) : (
            <div className="space-y-3">
              {groups.map((g) => (
                <div key={g.key} className="space-y-1">
                  <p className="text-[11px] font-medium text-text-tertiary">{g.label}</p>
                  <ul className="space-y-1">
                    {g.items.map((t) => (
                      <li key={t.id} className="flex items-center gap-2">
                        <StatusBadge status={t.status} />
                        <span
                          className={clsx(
                            "flex-1 min-w-0 text-sm break-words",
                            t.status === "done"
                              ? "text-text-tertiary line-through"
                              : "text-text-primary"
                          )}
                        >
                          {t.title}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
