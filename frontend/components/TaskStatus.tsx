"use client";

import type { TaskStatus } from "@/lib/types";
import { clsx } from "@/lib/clsx";

// Progress states cycle in this order when a user clicks the status control.
export const STATUS_ORDER: TaskStatus[] = ["todo", "in_progress", "done"];

export const STATUS_META: Record<
  TaskStatus,
  { label: string; dot: string; badge: string; text: string }
> = {
  todo: {
    label: "할 일",
    dot: "border-border",
    badge: "bg-bg text-text-secondary border border-border",
    text: "text-text-primary",
  },
  in_progress: {
    label: "진행 중",
    dot: "border-warning bg-warning/25",
    badge: "bg-warning/15 text-warning border border-warning/40",
    text: "text-text-primary",
  },
  done: {
    label: "완료",
    dot: "border-success bg-success text-white",
    badge: "bg-success/15 text-success border border-success/40",
    text: "text-text-tertiary line-through",
  },
};

export function nextStatus(status: TaskStatus): TaskStatus {
  const i = STATUS_ORDER.indexOf(status);
  return STATUS_ORDER[(i + 1) % STATUS_ORDER.length];
}

/** Interactive checkbox-style control that cycles todo → in_progress → done. */
export function StatusToggle({
  status,
  onClick,
}: {
  status: TaskStatus;
  onClick: () => void;
}) {
  const meta = STATUS_META[status];
  const next = STATUS_META[nextStatus(status)];
  return (
    <button
      onClick={onClick}
      aria-label={`상태: ${meta.label} (클릭 시 ${next.label})`}
      title={`${meta.label} → ${next.label}`}
      className={clsx(
        "h-5 w-5 shrink-0 rounded-md border-2 grid place-items-center transition-colors",
        meta.dot,
        status === "todo" && "hover:border-accent"
      )}
    >
      {status === "done" && <span className="text-xs leading-none">✓</span>}
      {status === "in_progress" && <span className="h-2 w-2 rounded-full bg-warning" />}
    </button>
  );
}

/** Read-only pill showing the current status (used in the team view). */
export function StatusBadge({ status }: { status: TaskStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className={clsx("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", meta.badge)}>
      {meta.label}
    </span>
  );
}
