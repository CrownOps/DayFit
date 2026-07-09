"use client";

import { useCallback, useEffect, useState } from "react";
import { tasksApi } from "@/lib/resources";
import type { Task } from "@/lib/types";
import { ApiError } from "@/lib/api";
import { Card, Spinner } from "@/components/ui";
import { clsx } from "@/lib/clsx";

/**
 * Shared team backlog ("팀 할일"). Anyone on the team can add an item to the pool,
 * and any teammate can "가져가기" (claim) one — which removes it from the pool and
 * drops it into that person's own 오늘 할 일 list.
 */
export function TeamTaskPool() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTasks(await tasksApi.teamPool());
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
      await tasksApi.claimTeamTask(task.id);
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "가져오기에 실패했습니다");
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
    <div className="space-y-3">
      {error && <p className="text-sm text-danger">{error}</p>}
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
