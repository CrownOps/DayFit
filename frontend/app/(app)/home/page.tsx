"use client";

import { useAuth } from "@/lib/auth";
import { koreanDate } from "@/lib/dates";
import { TaskBoard } from "@/components/TaskBoard";
import {
  HabitsWidget,
  RoomsWidget,
  ScheduleWidget,
  SnippetWidget,
  TeamConditionWidget,
  VisionWidget,
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

      {/* Team vision & mission — the north star, pinned at the top */}
      <VisionWidget />

      {/* Tasks — the pinned focus of the home screen */}
      <TaskBoard />

      {/* Glanceable summary widgets */}
      <section className="grid gap-4 sm:grid-cols-2">
        <ScheduleWidget />
        <HabitsWidget />
        <SnippetWidget />
        <TeamConditionWidget />
        <RoomsWidget />
      </section>
    </div>
  );
}
