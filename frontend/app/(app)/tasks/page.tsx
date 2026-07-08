"use client";

import { useState } from "react";
import { koreanDate } from "@/lib/dates";
import { TaskBoard } from "@/components/TaskBoard";
import { TeamTasks } from "@/components/TeamTasks";
import { clsx } from "@/lib/clsx";

export default function TasksPage() {
  const now = new Date();
  const [view, setView] = useState<"own" | "team">("own");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">할 일</h1>
          <p className="text-sm text-text-secondary">{koreanDate(now)}</p>
        </div>
        <div className="inline-flex rounded-lg border border-border bg-surface p-0.5">
          {(["own", "team"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={clsx(
                "px-3 py-1 rounded-md text-sm transition-colors",
                view === v ? "bg-accent text-white" : "text-text-secondary"
              )}
            >
              {v === "own" ? "내 할 일" : "팀"}
            </button>
          ))}
        </div>
      </div>

      {view === "own" ? <TaskBoard /> : <TeamTasks />}
    </div>
  );
}
