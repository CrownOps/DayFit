"use client";

import { useAuth } from "@/lib/auth";
import { koreanDate } from "@/lib/dates";
import { TaskWidget } from "@/components/TaskWidget";
import {
  HabitsWidget,
  ScheduleWidget,
  SnippetWidget,
  TeamConditionWidget,
  TokenWidget,
} from "@/components/DashboardWidgets";

export default function HomePage() {
  const { user } = useAuth();
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 5 ? "늦은 밤이에요" : hour < 12 ? "좋은 아침이에요" : hour < 18 ? "좋은 오후예요" : "좋은 저녁이에요";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">
          {greeting}{user?.name ? `, ${user.name}님` : ""}
        </h1>
        <p className="text-sm text-text-secondary">{koreanDate(now)}</p>
      </div>

      {/* Tasks — the pinned focus of the home screen */}
      <section className="grid gap-4 md:grid-cols-2">
        <TaskWidget scope="today" title="오늘 할 일" accent="accent" />
        <TaskWidget scope="week" title="이번 주 할 일" accent="secondary" />
      </section>

      {/* Glanceable summary widgets */}
      <section className="grid gap-4 sm:grid-cols-2">
        <ScheduleWidget />
        <HabitsWidget />
        <SnippetWidget />
        <TeamConditionWidget />
        <TokenWidget />
      </section>
    </div>
  );
}
