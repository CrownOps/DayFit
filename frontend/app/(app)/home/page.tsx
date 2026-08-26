"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { dashboardApi } from "@/lib/resources";
import type { Dashboard } from "@/lib/types";
import { ApiError } from "@/lib/api";
import { endOfDay, isoDate, koreanDate, startOfDay } from "@/lib/dates";
import { ErrorAlert } from "@/components/ui";
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

  // 위젯 전부를 한 번에. 날짜/범위는 브라우저 로컬 기준으로 넘긴다 — 서버는
  // UTC라 스스로 "오늘"을 계산하면 KST 사용자와 하루가 어긋난다.
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const today = new Date();
    try {
      setData(
        await dashboardApi.get(
          isoDate(today),
          startOfDay(today).toISOString(),
          endOfDay(today).toISOString()
        )
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "불러오기에 실패했습니다");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">
          {greeting}{user?.name ? `, ${user.name}님` : ""}
        </h1>
        <p className="text-sm text-text-secondary">{koreanDate(now)}</p>
      </div>

      <ErrorAlert>{error}</ErrorAlert>

      {/* Team vision & mission — the north star, pinned at the top */}
      <VisionWidget data={data} />

      {/* Tasks — the pinned focus of the home screen. Interactive, so it keeps
          its own fetching and mutations (it is shared with the 할 일 page). */}
      <TaskBoard />

      {/* Glanceable summary widgets */}
      <section className="grid gap-4 sm:grid-cols-2">
        <ScheduleWidget data={data} />
        <HabitsWidget data={data} />
        <SnippetWidget data={data} />
        <TeamConditionWidget data={data} />
        <RoomsWidget data={data} />
      </section>
    </div>
  );
}
