"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { snippetsApi, teamApi } from "@/lib/resources";
import type { HeatCell } from "@/components/Heatmap";
import type { Snippet, TeamHealthEntry } from "@/lib/types";
import { addDays, isoDate } from "@/lib/dates";
import { ApiError } from "@/lib/api";
import { Card, Spinner } from "@/components/ui";
import { Heatmap, conditionLevel } from "@/components/Heatmap";
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

  const heatData: Record<string, HeatCell> = {};
  for (const s of teamSnippets) {
    // Intensity by condition score; keep the highest-scoring member per day.
    const level = conditionLevel(s.condition_score);
    const existing = heatData[s.date];
    const title = `${s.date}${s.condition_score !== null ? ` · 컨디션 ${s.condition_score}/10` : ""}${
      s.author ? ` · ${s.author.name}` : ""
    }`;
    if (!existing || level > existing.level) heatData[s.date] = { level, title };
  }

  const scored = health.filter((m) => m.condition_score !== null);
  const avg = useMemo(() => {
    if (scored.length === 0) return null;
    return scored.reduce((a, m) => a + (m.condition_score ?? 0), 0) / scored.length;
  }, [scored]);

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
                팀원 {health.length}명 중 {scored.length}명 헬스체크 기록됨
              </p>
            </Card>
          )}

          {/* Per-member progress bars */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-text-primary">팀원별 컨디션</h2>
            {health.length === 0 ? (
              <Card>
                <p className="text-sm text-text-tertiary">
                  최근 팀 스니펫이 없습니다. 팀원이 스니펫에 헬스체크를 기록하면 여기에 표시됩니다.
                </p>
              </Card>
            ) : (
              <Card className="space-y-4">
                {health.map((m) => {
                  const score = m.condition_score;
                  const pct = score !== null ? (score / 10) * 100 : 0;
                  return (
                    <div key={m.user_id} className="space-y-1.5">
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
                    </div>
                  );
                })}
              </Card>
            )}
          </section>

          <Card className="space-y-3">
            <h2 className="text-sm font-semibold text-text-primary">팀 잔디 (최근)</h2>
            <Heatmap data={heatData} />
          </Card>
        </>
      )}
    </div>
  );
}
