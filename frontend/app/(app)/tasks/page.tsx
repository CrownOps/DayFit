"use client";

import { useState } from "react";
import { koreanDate } from "@/lib/dates";
import { TaskBoard } from "@/components/TaskBoard";
import { TeamTaskPool } from "@/components/TeamTaskPool";
import { TeamTasks } from "@/components/TeamTasks";
import { clsx } from "@/lib/clsx";

type View = "own" | "pool" | "team";

const VIEWS: { value: View; label: string }[] = [
  { value: "own", label: "내 할 일" },
  { value: "pool", label: "팀 할일" },
  { value: "team", label: "팀 현황" },
];

export default function TasksPage() {
  const now = new Date();
  const [view, setView] = useState<View>("own");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">할 일</h1>
          <p className="text-sm text-text-secondary">{koreanDate(now)}</p>
        </div>
        <div className="inline-flex rounded-lg border border-border bg-surface p-0.5">
          {VIEWS.map((v) => (
            <button
              key={v.value}
              onClick={() => setView(v.value)}
              className={clsx(
                "px-3 py-1 rounded-md text-sm transition-colors",
                view === v.value ? "bg-accent text-white" : "text-text-secondary"
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {view === "own" && <TaskBoard />}
      {view === "pool" && <TeamTaskPool />}
      {view === "team" && <TeamTasks />}
    </div>
  );
}
