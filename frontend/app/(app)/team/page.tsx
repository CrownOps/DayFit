"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { snippetsApi, teamApi } from "@/lib/resources";
import type { Snippet, TeamHealthEntry } from "@/lib/types";
import { addDays, isoDate } from "@/lib/dates";
import { ApiError } from "@/lib/api";
import { Card, Spinner } from "@/components/ui";
import { ConditionTrend, type TrendPoint } from "@/components/ConditionTrend";
import { clsx } from "@/lib/clsx";

function barColor(score: number | null): string {
  if (score === null) return "bg-border";
  if (score >= 7) return "bg-success";
  if (score >= 4) return "bg-warning";
  return "bg-danger";
}

function textColor(score: number | null): string {
  if (score === null) return "text-text-tertiary";
  if (score >= 7) return "text-success";
  if (score >= 4) return "text-warning";
  return "text-danger";
}

const PERIODS = [
  { key: 7, label: "1주" },
  { key: 14, label: "2주" },
  { key: 30, label: "1개월" },
] as const;

export default function TeamPage() {
  const [health, setHealth] = useState<TeamHealthEntry[]>([]);
  const [teamSnippets, setTeamSnippets] = useState<Snippet[]>([]);
  const [days, setDays] = useState<number>(14);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const from = isoDate(addDays(new Date(), -140));
      const [h, snips] = await Promise.all([
        teamApi.health(days),
        snippetsApi.list("team", from, isoDate(new Date())),
      ]);
      setHealth(h);
      setTeamSnippets(snips);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "불러오기에 실패했습니다");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  // Per-member condition trend over the selected period, from team snippets.
  const trendFromMs = addDays(new Date(), -days).setHours(0, 0, 0, 0);
  const trendToMs = new Date().setHours(23, 59, 59, 999);
  const trendByUser = useMemo(() => {
    const map = new Map<number, TrendPoint[]>();
    for (const s of teamSnippets) {
      if (!s.author || s.condition_score === null) continue;
      if (Date.parse(s.date) < trendFromMs) continue;
      const arr = map.get(s.author.id) ?? [];
      arr.push({ date: s.date, score: s.condition_score });
      map.set(s.author.id, arr);
    }
    for (const arr of map.values()) arr.sort((a, b) => (a.date < b.date ? -1 : 1));
    return map;
  }, [teamSnippets, trendFromMs]);

  // Each member's most recent *recorded* condition (latest trend point).
  const latestScoreByUser = useMemo(() => {
    const m = new Map<number, number>();
    for (const [uid, pts] of trendByUser) {
      if (pts.length > 0) m.set(uid, pts[pts.length - 1].score);
    }
    return m;
  }, [trendByUser]);

  const scoredCount = latestScoreByUser.size;
  const avg = useMemo(() => {
    if (latestScoreByUser.size === 0) return null;
    const vals = [...latestScoreByUser.values()];
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }, [latestScoreByUser]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">팀 헬스체크</h1>
          <p className="text-sm text-text-secondary">
            CrownOps 팀 컨디션 (최근 {PERIODS.find((p) => p.key === days)?.label} 기록 기준)
          </p>
        </div>
        <div className="inline-flex shrink-0 rounded-lg border border-border bg-surface p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setDays(p.key)}
              className={clsx(
                "px-2.5 py-1 rounded-md text-sm transition-colors",
                days === p.key ? "bg-accent text-white" : "text-text-secondary"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {loading ? (
        <div className="grid place-items-center py-16">
          <Spinner className="h-8 w-8" />
        </div>
      ) : (
        <>
          {/* Team average */}
          {avg !== null && (
            <Card className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-text-primary">팀 평균 컨디션</span>
                <span className={clsx("text-sm font-mono font-semibold", textColor(Math.round(avg)))}>
                  {avg.toFixed(1)}/10
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-border overflow-hidden">
                <div
                  className={clsx("h-full rounded-full transition-all", barColor(Math.round(avg)))}
                  style={{ width: `${(avg / 10) * 100}%` }}
                />
              </div>
              <p className="text-xs text-text-tertiary">
                팀원 {health.length}명 중 {scoredCount}명 헬스체크 기록됨
              </p>
            </Card>
          )}

          {/* Per-member condition: current score + trend over the period */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-text-primary">팀원별 컨디션 추이</h2>
            {health.length === 0 ? (
              <Card>
                <p className="text-sm text-text-tertiary">
                  최근 팀 스니펫이 없습니다. 팀원이 스니펫에 헬스체크를 기록하면 여기에 표시됩니다.
                </p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {/* Single column: for each member, a progress-bar box followed by
                    a condition-trend box (6 rows for 3 members). */}
                {health.map((m) => {
                  // Progress bar reflects the most recent *recorded* condition
                  // (the latest point on the trend), not the latest snippet —
                  // which often has no health-check score.
                  const points = trendByUser.get(m.user_id) ?? [];
                  const score = points.length > 0 ? points[points.length - 1].score : null;
                  const pct = score !== null ? (score / 10) * 100 : 0;
                  return (
                    <div key={m.user_id} className="contents">
                      <Card className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm font-medium text-text-primary truncate">{m.name}</span>
                            {m.has_snippet_today ? (
                              <span className="shrink-0 text-[10px] rounded-full bg-success/15 text-success px-1.5 py-0.5">
                                오늘
                              </span>
                            ) : (
                              <span className="shrink-0 text-[10px] rounded-full bg-border text-text-tertiary px-1.5 py-0.5">
                                {m.date ?? "기록 없음"}
                              </span>
                            )}
                          </div>
                          <span className={clsx("text-sm font-mono font-semibold shrink-0", textColor(score))}>
                            {score !== null ? `${score}/10` : "—"}
                          </span>
                        </div>
                        <div
                          className="h-2 rounded-full bg-border overflow-hidden"
                          role="progressbar"
                          aria-valuenow={score ?? 0}
                          aria-valuemin={0}
                          aria-valuemax={10}
                        >
                          <div
                            className={clsx("h-full rounded-full transition-all", barColor(score))}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </Card>

                      <Card className="space-y-2">
                        <div className="text-xs font-medium text-text-secondary truncate">
                          {m.name} · 컨디션 추이
                        </div>
                        <ConditionTrend
                          points={trendByUser.get(m.user_id) ?? []}
                          fromMs={trendFromMs}
                          toMs={trendToMs}
                        />
                      </Card>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
