"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { tasksApi } from "@/lib/resources";
import type { Task, TaskScope } from "@/lib/types";
import { ApiError } from "@/lib/api";
import { Card, ErrorAlert, Spinner } from "@/components/ui";
import { clsx } from "@/lib/clsx";
import { STATUS_META, StatusToggle, nextStatus } from "@/components/TaskStatus";

type Lists = Record<TaskScope, Task[]>;

const COLUMNS: {
  scope: TaskScope;
  title: string;
  accent: "accent" | "secondary";
}[] = [
  { scope: "today", title: "오늘 할 일", accent: "accent" },
  { scope: "week", title: "이번 주 할 일", accent: "secondary" },
];

interface DropTarget {
  scope: TaskScope;
  beforeId: number | null; // null = drop at the end of the column
}

/**
 * Two-column to-do board (오늘 / 이번 주). Each task is a draggable block that can
 * be reordered within a column or dragged to the other column — moving between
 * 오늘/이번 주 is done purely by dragging the block. The title is editable inline
 * (click the text to rename).
 */
export function TaskBoard() {
  const [lists, setLists] = useState<Lists>({ today: [], week: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Mirror of `lists` so drag handlers always compute from the latest order
  // (avoids stale closures across rapid drops).
  const listsRef = useRef(lists);
  useEffect(() => {
    listsRef.current = lists;
  }, [lists]);

  const [draggingId, setDraggingId] = useState<number | null>(null);
  const draggingFrom = useRef<TaskScope | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [today, week] = await Promise.all([
        tasksApi.list("today", "own"),
        tasksApi.list("week", "own"),
      ]);
      setLists({ today, week });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "불러오기에 실패했습니다");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addTask(scope: TaskScope, title: string) {
    try {
      const created = await tasksApi.create(title, scope);
      setLists((prev) => ({ ...prev, [scope]: [...prev[scope], created] }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "추가에 실패했습니다");
    }
  }

  async function cycleStatus(scope: TaskScope, task: Task) {
    const status = nextStatus(task.status);
    setLists((prev) => ({
      ...prev,
      [scope]: prev[scope].map((t) =>
        t.id === task.id ? { ...t, status, completed: status === "done" } : t
      ),
    }));
    try {
      await tasksApi.update(task.id, { status });
    } catch {
      load();
    }
  }

  async function editTitle(scope: TaskScope, task: Task, title: string) {
    const trimmed = title.trim();
    if (!trimmed || trimmed === task.title) return;
    setLists((prev) => ({
      ...prev,
      [scope]: prev[scope].map((t) => (t.id === task.id ? { ...t, title: trimmed } : t)),
    }));
    try {
      await tasksApi.update(task.id, { title: trimmed });
    } catch {
      load();
    }
  }

  async function removeTask(scope: TaskScope, task: Task) {
    setLists((prev) => ({ ...prev, [scope]: prev[scope].filter((t) => t.id !== task.id) }));
    try {
      await tasksApi.remove(task.id);
    } catch {
      load();
    }
  }

  // Move `id` from `from` into `to`, inserting before `beforeId` (or at the end
  // when null). Persists the target column's new order.
  const moveTask = useCallback(
    async (id: number, from: TaskScope, to: TaskScope, beforeId: number | null) => {
      const prev = listsRef.current;
      const task = prev[from].find((t) => t.id === id);
      if (!task) return;

      const originList = prev[from].filter((t) => t.id !== id);
      const moved: Task = { ...task, scope: to };
      const targetBase = to === from ? originList : [...prev[to]];
      const idx = beforeId == null ? targetBase.length : targetBase.findIndex((t) => t.id === beforeId);
      const at = idx < 0 ? targetBase.length : idx;
      const targetList = [...targetBase.slice(0, at), moved, ...targetBase.slice(at)];

      const next: Lists =
        to === from ? { ...prev, [to]: targetList } : { ...prev, [from]: originList, [to]: targetList };
      setLists(next);
      listsRef.current = next;

      try {
        await tasksApi.reorder(to, targetList.map((t) => t.id));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "이동에 실패했습니다");
        load();
      }
    },
    [load]
  );

  function endDrag() {
    setDraggingId(null);
    draggingFrom.current = null;
    setDropTarget(null);
  }

  function handleDrop(scope: TaskScope, beforeId: number | null) {
    const id = draggingId;
    const from = draggingFrom.current;
    endDrag();
    if (id != null && from != null) moveTask(id, from, scope, beforeId);
  }

  return (
    <div className="space-y-3">
      <ErrorAlert>{error}</ErrorAlert>
      <div className="grid gap-4 md:grid-cols-2">
        {COLUMNS.map((col) => (
          <Column
            key={col.scope}
            col={col}
            tasks={lists[col.scope]}
            loading={loading}
            draggingId={draggingId}
            dropTarget={dropTarget}
            onAdd={(title) => addTask(col.scope, title)}
            onCycle={(task) => cycleStatus(col.scope, task)}
            onEdit={(task, title) => editTitle(col.scope, task, title)}
            onRemove={(task) => removeTask(col.scope, task)}
            onDragStartTask={(task) => {
              setDraggingId(task.id);
              draggingFrom.current = col.scope;
            }}
            onDragEndTask={endDrag}
            onHover={setDropTarget}
            onDrop={handleDrop}
          />
        ))}
      </div>
    </div>
  );
}

function Column({
  col,
  tasks,
  loading,
  draggingId,
  dropTarget,
  onAdd,
  onCycle,
  onEdit,
  onRemove,
  onDragStartTask,
  onDragEndTask,
  onHover,
  onDrop,
}: {
  col: (typeof COLUMNS)[number];
  tasks: Task[];
  loading: boolean;
  draggingId: number | null;
  dropTarget: DropTarget | null;
  onAdd: (title: string) => void;
  onCycle: (task: Task) => void;
  onEdit: (task: Task, title: string) => void;
  onRemove: (task: Task) => void;
  onDragStartTask: (task: Task) => void;
  onDragEndTask: () => void;
  onHover: (t: DropTarget | null) => void;
  onDrop: (scope: TaskScope, beforeId: number | null) => void;
}) {
  const done = tasks.filter((t) => t.status === "done").length;
  const inProgress = tasks.filter((t) => t.status === "in_progress").length;
  const dotColor = col.accent === "secondary" ? "bg-accent-secondary" : "bg-accent";
  const isDropCol = draggingId != null && dropTarget?.scope === col.scope;

  // Which id the drop line should render before (or `end` for the tail).
  const lineBefore = isDropCol ? dropTarget!.beforeId ?? "end" : null;

  function beforeIdFromPointer(e: React.DragEvent, task: Task): number | null {
    const rect = e.currentTarget.getBoundingClientRect();
    const topHalf = e.clientY < rect.top + rect.height / 2;
    if (topHalf) return task.id;
    const i = tasks.findIndex((t) => t.id === task.id);
    return tasks[i + 1]?.id ?? null;
  }

  return (
    <Card
      className={clsx(
        "space-y-3 flex flex-col transition-colors",
        isDropCol && "ring-2 ring-accent/50"
      )}
      onDragOver={(e) => {
        if (draggingId == null) return;
        e.preventDefault();
        // Default target = end of column; item handlers refine this.
        onHover({ scope: col.scope, beforeId: null });
      }}
      onDrop={(e) => {
        if (draggingId == null) return;
        e.preventDefault();
        onDrop(col.scope, dropTarget?.scope === col.scope ? dropTarget.beforeId : null);
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={clsx("h-2 w-2 rounded-full", dotColor)} />
          <h2 className="text-sm font-semibold text-text-primary">{col.title}</h2>
        </div>
        {tasks.length > 0 && (
          <span className="text-xs font-mono text-text-tertiary">
            {done}/{tasks.length}
            {inProgress > 0 && <span className="text-warning"> · 진행 {inProgress}</span>}
          </span>
        )}
      </div>

      {tasks.length > 0 && (
        <div className="h-1.5 w-full rounded-full bg-border overflow-hidden">
          <div
            className="h-full rounded-full bg-success transition-all"
            style={{ width: `${Math.round((done / tasks.length) * 100)}%` }}
          />
        </div>
      )}

      {loading ? (
        <div className="grid place-items-center py-6">
          <Spinner className="h-5 w-5" />
        </div>
      ) : (
        <ul className="space-y-1.5 min-h-[2.5rem]">
          {tasks.length === 0 && (
            <li className="text-sm text-text-tertiary py-1">
              할 일이 없습니다. 아래에서 추가하거나 여기로 끌어다 놓으세요.
            </li>
          )}
          {tasks.map((task) => (
            <li key={task.id} className="space-y-1.5">
              {lineBefore === task.id && <DropLine />}
              <TaskRow
                task={task}
                dragging={draggingId === task.id}
                onCycle={() => onCycle(task)}
                onEdit={(title) => onEdit(task, title)}
                onRemove={() => onRemove(task)}
                onDragStart={() => onDragStartTask(task)}
                onDragEnd={onDragEndTask}
                onDragOver={(e) => {
                  if (draggingId == null) return;
                  e.preventDefault();
                  e.stopPropagation();
                  onHover({ scope: col.scope, beforeId: beforeIdFromPointer(e, task) });
                }}
                onDrop={(e) => {
                  if (draggingId == null) return;
                  e.preventDefault();
                  e.stopPropagation();
                  onDrop(col.scope, beforeIdFromPointer(e, task));
                }}
              />
            </li>
          ))}
          {lineBefore === "end" && tasks.length > 0 && <DropLine />}
        </ul>
      )}

      <AddForm onAdd={onAdd} />
    </Card>
  );
}

function DropLine() {
  return <div className="h-0.5 rounded-full bg-accent" />;
}

function TaskRow({
  task,
  dragging,
  onCycle,
  onEdit,
  onRemove,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  task: Task;
  dragging: boolean;
  onCycle: () => void;
  onEdit: (title: string) => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(task.title);

  function startEdit() {
    setValue(task.title);
    setEditing(true);
  }

  function commit() {
    setEditing(false);
    onEdit(value);
  }

  return (
    <div
      // Disable dragging while editing so text selection works inside the input.
      draggable={!editing}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(task.id));
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={clsx(
        "group flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-2",
        !editing && "cursor-grab active:cursor-grabbing",
        "transition-opacity",
        dragging && "opacity-40"
      )}
    >
      <span className="shrink-0 select-none text-text-tertiary leading-none" aria-hidden>
        ⠿
      </span>
      <StatusToggle status={task.status} onClick={onCycle} />
      {task.claimed_at && (
        <span
          title={`${new Date(task.claimed_at).toLocaleString("ko-KR")}에 팀 할일에서 가져옴`}
          className="shrink-0 rounded-full bg-accent-secondary/15 text-accent-secondary border border-accent-secondary/40 px-1.5 py-0.5 text-[10px] font-medium"
        >
          팀
        </span>
      )}
      {task.calendar_event_id != null && (
        <span title="일정에서 승격된 할일" className="shrink-0 text-xs" aria-hidden>
          📅
        </span>
      )}
      {editing ? (
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              setEditing(false);
              setValue(task.title);
            }
          }}
          className="flex-1 min-w-0 rounded-md border border-accent bg-surface px-1.5 py-0.5 text-sm text-text-primary outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={startEdit}
          title="클릭하여 수정"
          className={clsx(
            "flex-1 min-w-0 text-left text-sm break-words hover:text-accent transition-colors",
            STATUS_META[task.status].text
          )}
        >
          {task.title}
        </button>
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label="삭제"
        className="shrink-0 text-text-tertiary hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity text-sm"
      >
        ✕
      </button>
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
  );
}
