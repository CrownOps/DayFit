"use client";

import { koreanDate } from "@/lib/dates";
import { TaskWidget } from "@/components/TaskWidget";

export default function TasksPage() {
  const now = new Date();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">할 일</h1>
        <p className="text-sm text-text-secondary">{koreanDate(now)}</p>
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        <TaskWidget scope="today" title="오늘 할 일" accent="accent" />
        <TaskWidget scope="week" title="이번 주 할 일" accent="secondary" />
      </section>
    </div>
  );
}
