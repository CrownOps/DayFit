"use client";

import { useCallback, useEffect, useState } from "react";
import { tasksApi } from "@/lib/resources";
import type { Task } from "@/lib/types";
import { ApiError } from "@/lib/api";
import { Card, ErrorAlert, Spinner } from "@/components/ui";
import { StatusBadge } from "@/components/TaskStatus";
import { clsx } from "@/lib/clsx";

/** "M월 D일 HH:MM" for a claim timestamp. */
function claimedLabel(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${hh}:${mm}`;
}

/**
 * Shared team backlog ("팀 할일"). Anyone on the team can add an item to the pool,
 * and any teammate can "가져가기" (claim) one — which moves it into that person's
 * own 오늘 할 일 list. Claimed items are kept as a record (누가·언제 가져갔는지) and
 * can be "복구" (restored) back to the pool.
 */
export function TeamTaskPool() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [claimed, setClaimed] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pool, claimedList] = await Promise.all([
        tasksApi.teamPool(),
        tasksApi.claimedTeamTasks(),
      ]);
      setTasks(pool);
      setClaimed(claimedList);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "불러오기에 실패했습니다");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addTask(title: string) {
    try {
      const created = await tasksApi.createTeamTask(title);
      setTasks((prev) => [...prev, created]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "추가에 실패했습니다");
    }
  }

  async function claim(task: Task) {
    setBusyId(task.id);
    setError(null);
    try {
      const record = await tasksApi.claimTeamTask(task.id);
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
      setClaimed((prev) => [record, ...prev]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "가져오기에 실패했습니다");
    } finally {
      setBusyId(null);
    }
  }

  async function restore(task: Task) {
    setBusyId(task.id);
    setError(null);
    try {
      const restored = await tasksApi.restoreTeamTask(task.id);
      setClaimed((prev) => prev.filter((t) => t.id !== task.id));
      setTasks((prev) => [...prev, restored]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "복구에 실패했습니다");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(task: Task) {
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
    try {
      await tasksApi.removeTeamTask(task.id);
    } catch {
      load();
    }
  }

  return (
    <div className="space-y-4">
      <ErrorAlert>{error}</ErrorAlert>
      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-accent-secondary" />
            <h2 className="text-sm font-semibold text-text-primary">팀 할일 (가져가기)</h2>
          </div>
          {tasks.length > 0 && (
            <span className="text-xs font-mono text-text-tertiary">{tasks.length}개</span>
          )}
        </div>
        <p className="text-xs text-text-tertiary">
          팀이 공유하는 할 일 목록입니다. &apos;가져가기&apos;를 누르면 내 오늘 할 일로 옮겨집니다.
        </p>

        {loading ? (
          <div className="grid place-items-center py-6">
            <Spinner className="h-5 w-5" />
          </div>
        ) : (
          <ul className="space-y-1.5">
            {tasks.length === 0 && (
              <li className="text-sm text-text-tertiary py-1">
                공유된 팀 할일이 없습니다. 아래에서 추가해 보세요.
              </li>
            )}
            {tasks.map((task) => (
              <li
                key={task.id}
                className="group flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-2"
              >
                <span className="flex-1 min-w-0 text-sm break-words text-text-primary">
                  {task.title}
                </span>
                <button
                  type="button"
                  onClick={() => claim(task)}
                  disabled={busyId === task.id}
                  className={clsx(
                    "shrink-0 rounded-md bg-accent text-white px-2 py-0.5 text-[11px] font-medium",
                    "hover:bg-accent-hover disabled:opacity-50"
                  )}
                >
                  {busyId === task.id ? "…" : "가져가기"}
                </button>
                <button
                  type="button"
                  onClick={() => remove(task)}
                  aria-label="삭제"
                  className="shrink-0 text-text-tertiary hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity text-sm"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        <AddForm onAdd={addTask} />
      </Card>

      {!loading && claimed.length > 0 && (
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-text-tertiary" />
              <h2 className="text-sm font-semibold text-text-primary">가져간 기록</h2>
            </div>
            <span className="text-xs font-mono text-text-tertiary">{claimed.length}개</span>
          </div>
          <p className="text-xs text-text-tertiary">
            누가 언제 가져갔는지 기록입니다. &apos;복구&apos;를 누르면 다시 팀 할 일로 되돌립니다.
          </p>
          <ul className="space-y-1.5">
            {claimed.map((task) => (
              <li
                key={task.id}
                className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-2"
              >
                <StatusBadge status={task.status} />
                <div className="flex-1 min-w-0">
                  <p
                    className={clsx(
                      "text-sm break-words",
                      task.status === "done"
                        ? "text-text-tertiary line-through"
                        : "text-text-primary"
                    )}
                  >
                    {task.title}
                  </p>
                  <p className="text-[11px] text-text-tertiary">
                    {task.owner?.name ?? "알 수 없음"}
                    {task.claimed_at ? ` · ${claimedLabel(task.claimed_at)}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => restore(task)}
                  disabled={busyId === task.id}
                  className={clsx(
                    "shrink-0 rounded-md border border-border px-2 py-0.5 text-[11px] font-medium",
                    "text-text-secondary hover:border-accent hover:text-accent transition-colors disabled:opacity-50"
                  )}
                >
                  {busyId === task.id ? "…" : "복구"}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function AddForm({ onAdd }: { onAdd: (title: string) => void }) {
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = draft.trim();
    if (!value || adding) return;
    setAdding(true);
    try {
      await onAdd(value);
      setDraft("");
    } finally {
      setAdding(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2 pt-1">
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="+ 팀 할일 추가"
        className="flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent outline-none"
      />
      <button
        type="submit"
        disabled={adding || !draft.trim()}
        className="shrink-0 rounded-lg bg-accent text-white px-3 py-1.5 text-sm font-medium hover:bg-accent-hover disabled:opacity-50"
      >
        추가
      </button>
    </form>
  );
}
