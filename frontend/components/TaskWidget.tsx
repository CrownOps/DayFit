"use client";

import { useCallback, useEffect, useState } from "react";
import { tasksApi } from "@/lib/resources";
import type { Task, TaskScope } from "@/lib/types";
import { ApiError } from "@/lib/api";
import { Card, Spinner } from "@/components/ui";
import { clsx } from "@/lib/clsx";

export function TaskWidget({
  scope,
  title,
  accent = "accent",
}: {
  scope: TaskScope;
  title: string;
  accent?: "accent" | "secondary";
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTasks(await tasksApi.list(scope));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "불러오기에 실패했습니다");
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    load();
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const value = draft.trim();
    if (!value) return;
    setAdding(true);
    setError(null);
    try {
      const created = await tasksApi.create(value, scope);
      setTasks((prev) => [...prev, created]);
      setDraft("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "추가에 실패했습니다");
    } finally {
      setAdding(false);
    }
  }

  async function toggle(task: Task) {
    // optimistic
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, completed: !t.completed } : t))
    );
    try {
      await tasksApi.update(task.id, { completed: !task.completed });
    } catch {
      load();
    }
  }

  async function remove(task: Task) {
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
    try {
      await tasksApi.remove(task.id);
    } catch {
      load();
    }
  }

  const done = tasks.filter((t) => t.completed).length;
  const dotColor = accent === "secondary" ? "bg-accent-secondary" : "bg-accent";

  return (
    <Card className="space-y-3 flex flex-col">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={clsx("h-2 w-2 rounded-full", dotColor)} />
          <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
        </div>
        {tasks.length > 0 && (
          <span className="text-xs font-mono text-text-tertiary">
            {done}/{tasks.length}
          </span>
        )}
      </div>

      {loading ? (
        <div className="grid place-items-center py-6">
          <Spinner className="h-5 w-5" />
        </div>
      ) : (
        <ul className="space-y-1">
          {tasks.length === 0 && (
            <li className="text-sm text-text-tertiary py-1">할 일이 없습니다. 아래에서 추가하세요.</li>
          )}
          {tasks.map((task) => (
            <li key={task.id} className="group flex items-center gap-2">
              <button
                onClick={() => toggle(task)}
                aria-label={task.completed ? "완료 취소" : "완료"}
                className={clsx(
                  "h-5 w-5 shrink-0 rounded-md border-2 grid place-items-center transition-colors",
                  task.completed
                    ? "bg-success border-success text-white"
                    : "border-border hover:border-accent"
                )}
              >
                {task.completed && <span className="text-xs leading-none">✓</span>}
              </button>
              <span
                className={clsx(
                  "flex-1 min-w-0 text-sm break-words",
                  task.completed ? "text-text-tertiary line-through" : "text-text-primary"
                )}
              >
                {task.title}
              </span>
              <button
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

      <form onSubmit={add} className="flex items-center gap-2 pt-1">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="+ 할 일 추가"
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

      {error && <p className="text-xs text-danger">{error}</p>}
    </Card>
  );
}
