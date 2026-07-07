"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { snippetsApi } from "@/lib/resources";
import type { Snippet } from "@/lib/types";
import { addDays, isoDate } from "@/lib/dates";
import { ApiError } from "@/lib/api";
import { Button, Card, Spinner, Textarea } from "@/components/ui";
import { Heatmap, aiScoreLevel, type HeatCell } from "@/components/Heatmap";
import { clsx } from "@/lib/clsx";
import { SNIPPET_TEMPLATE } from "@/lib/snippetTemplate";

export default function SnippetsPage() {
  const [scope, setScope] = useState<"own" | "team">("own");
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  // Filters for the recent list (member is team-scope only).
  const [memberFilter, setMemberFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("");

  const today = isoDate(new Date());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const from = isoDate(addDays(new Date(), -140));
      const list = await snippetsApi.list(scope, from, today);
      setSnippets(list);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "불러오기에 실패했습니다");
    } finally {
      setLoading(false);
    }
  }, [scope, today]);

  useEffect(() => {
    load();
  }, [load]);

  // My today's snippet (for the write box) — only meaningful in own scope.
  const myToday = useMemo(
    () => snippets.find((s) => s.date === today) ?? null,
    [snippets, today]
  );

  // Prefill: existing snippet content, or the markdown template for a fresh day.
  useEffect(() => {
    setDraft(myToday?.content ?? SNIPPET_TEMPLATE);
  }, [myToday]);

  const heatData = useMemo(() => {
    const map: Record<string, HeatCell> = {};

    // Own scope: a single author — intensity is the AI grading score (0–100).
    if (scope === "own") {
      for (const s of snippets) {
        const level = aiScoreLevel(s.ai_score);
        const existing = map[s.date];
        const title = `${s.date}${s.ai_score !== null ? ` · AI 점수 ${s.ai_score}/100` : " · 채점 전"}`;
        if (!existing || level > existing.level) map[s.date] = { level, title };
      }
      return map;
    }

    // Team scope: intensity reflects BOTH participation (how many members
    // submitted that day) and their AI grading scores. Darkest = everyone
    // submitted AND scores are high. Participation is the dominant factor so
    // a single high score can't darken a low-turnout day.
    const teamSize =
      new Set(snippets.map((s) => s.author?.id).filter((id): id is number => id != null)).size || 1;

    const byDate = new Map<string, Snippet[]>();
    for (const s of snippets) {
      const arr = byDate.get(s.date) ?? [];
      arr.push(s);
      byDate.set(s.date, arr);
    }

    for (const [d, items] of byDate) {
      const submitters =
        new Set(items.map((s) => s.author?.id).filter((id): id is number => id != null)).size ||
        items.length;
      const participation = Math.min(1, submitters / teamSize);

      const scores = items.map((s) => s.ai_score).filter((v): v is number => v !== null);
      const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
      // Not-yet-scored days are neutral (0.5) so participation still shows through.
      const scoreFactor = avgScore !== null ? avgScore / 100 : 0.5;

      const combined = participation * (0.5 + 0.5 * scoreFactor);
      const level: HeatCell["level"] =
        combined >= 0.75 ? 4 : combined >= 0.5 ? 3 : combined >= 0.25 ? 2 : 1;

      const scoreLabel = avgScore !== null ? ` · 평균 AI 점수 ${Math.round(avgScore)}/100` : "";
      map[d] = { level, title: `${d} · ${submitters}/${teamSize}명 제출${scoreLabel}` };
    }
    return map;
  }, [snippets, scope]);

  async function saveDraft() {
    setSaving(true);
    setError(null);
    try {
      if (myToday) await snippetsApi.update(myToday.id, draft);
      else await snippetsApi.create(draft);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "저장에 실패했습니다");
    } finally {
      setSaving(false);
    }
  }

  // Reset filters when switching scope (member filter is meaningless in own scope).
  useEffect(() => {
    setMemberFilter("all");
    setDateFilter("");
  }, [scope]);

  // Distinct authors present in the loaded team snippets, for the member dropdown.
  const members = useMemo(() => {
    const map = new Map<number, string>();
    for (const s of snippets) {
      if (s.author) map.set(s.author.id, s.author.name);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "ko"));
  }, [snippets]);

  const recent = useMemo(() => {
    return [...snippets]
      .filter((s) => {
        if (dateFilter && s.date !== dateFilter) return false;
        if (scope === "team" && memberFilter !== "all") {
          if (String(s.author?.id ?? "") !== memberFilter) return false;
        }
        return true;
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 50);
  }, [snippets, scope, memberFilter, dateFilter]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text-primary">데일리 스니펫</h1>
        <div className="inline-flex rounded-lg border border-border bg-surface p-0.5">
          {(["own", "team"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={clsx(
                "px-3 py-1 rounded-md text-sm transition-colors",
                scope === s ? "bg-accent text-white" : "text-text-secondary"
              )}
            >
              {s === "own" ? "내 기록" : "팀"}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {/* Write box (own scope only) */}
      {scope === "own" && (
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-primary">
              오늘의 스니펫 {myToday ? "(수정)" : "(작성)"}
            </h2>
            <button
              type="button"
              onClick={() => setDraft(SNIPPET_TEMPLATE)}
              className="text-xs text-accent hover:underline"
            >
              템플릿 넣기
            </button>
          </div>
          <Textarea
            rows={14}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="font-mono text-xs leading-relaxed"
            placeholder="오늘 한 일, 블로커, 배운 점 등을 자유롭게 기록하세요. 기록을 저장하면 AI가 채점한 점수(0~100)가 잔디 색에 반영됩니다."
          />
          <div className="flex justify-end">
            <Button onClick={saveDraft} disabled={saving || !draft.trim()}>
              {saving ? <Spinner className="h-4 w-4 border-white/40 border-t-white" /> : "저장"}
            </Button>
          </div>
        </Card>
      )}

      {/* Heatmap */}
      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">
            {scope === "own" ? "내 잔디" : "팀 잔디"}
          </h2>
          <div className="flex items-center gap-1 text-xs text-text-tertiary">
            <span>{scope === "own" ? "AI 점수 낮음" : "참여·AI 점수 낮음"}</span>
            {[1, 2, 3, 4].map((l) => (
              <span
                key={l}
                className={clsx(
                  "h-3 w-3 rounded-sm inline-block",
                  ["bg-accent/25", "bg-accent/45", "bg-accent/70", "bg-accent"][l - 1]
                )}
              />
            ))}
            <span>높음</span>
          </div>
        </div>
        {loading ? (
          <div className="grid place-items-center py-8">
            <Spinner className="h-6 w-6" />
          </div>
        ) : (
          <Heatmap data={heatData} />
        )}
      </Card>

      {/* Recent snippets */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-text-primary">최근 기록</h2>
          <div className="flex flex-wrap items-center gap-2">
            {scope === "team" && (
              <select
                value={memberFilter}
                onChange={(e) => setMemberFilter(e.target.value)}
                aria-label="팀원 필터"
                className="rounded-lg border border-border bg-surface px-2 py-1 text-xs text-text-primary focus:border-accent outline-none"
              >
                <option value="all">팀원 전체</option>
                {members.map(([id, name]) => (
                  <option key={id} value={String(id)}>
                    {name}
                  </option>
                ))}
              </select>
            )}
            <input
              type="date"
              value={dateFilter}
              max={today}
              onChange={(e) => setDateFilter(e.target.value)}
              aria-label="날짜 필터"
              className="rounded-lg border border-border bg-surface px-2 py-1 text-xs text-text-primary focus:border-accent outline-none"
            />
            {(dateFilter || memberFilter !== "all") && (
              <button
                type="button"
                onClick={() => {
                  setDateFilter("");
                  setMemberFilter("all");
                }}
                className="text-xs text-accent hover:underline"
              >
                초기화
              </button>
            )}
          </div>
        </div>
        {!loading && recent.length === 0 && (
          <Card>
            <p className="text-sm text-text-tertiary">
              {dateFilter || memberFilter !== "all"
                ? "조건에 맞는 스니펫이 없습니다."
                : "아직 작성된 스니펫이 없습니다."}
            </p>
          </Card>
        )}
        {recent.map((s) => (
          <SnippetCard key={s.id} snippet={s} showAuthor={scope === "team"} />
        ))}
      </section>
    </div>
  );
}

function SnippetCard({ snippet, showAuthor }: { snippet: Snippet; showAuthor: boolean }) {
  const [expanded, setExpanded] = useState(false);
  // Show the toggle only when the content is long enough to be clipped.
  const clipped = snippet.content.length > 160 || snippet.content.split("\n").length > 4;

  return (
    <Card className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="text-xs font-mono text-text-secondary">
          {snippet.date}
          {showAuthor && snippet.author ? ` · ${snippet.author.name}` : ""}
        </div>
        {snippet.ai_score !== null && (
          <span className="text-xs font-mono text-text-secondary">AI 점수 {snippet.ai_score}/100</span>
        )}
      </div>
      <p
        className={clsx(
          "text-sm text-text-primary whitespace-pre-wrap",
          !expanded && clipped && "line-clamp-4"
        )}
      >
        {snippet.content}
      </p>
      {clipped && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-accent hover:underline"
        >
          {expanded ? "접기" : "더보기"}
        </button>
      )}
    </Card>
  );
}
