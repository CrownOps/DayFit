"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { snippetsApi } from "@/lib/resources";
import type { Snippet } from "@/lib/types";
import { addDays, isoDate } from "@/lib/dates";
import { ApiError } from "@/lib/api";
import { Button, Card, Spinner, Textarea } from "@/components/ui";
import { Heatmap, aiScoreLevel, type HeatCell } from "@/components/Heatmap";
import { SnippetTasks } from "@/components/SnippetTasks";
import { clsx } from "@/lib/clsx";
import { SNIPPET_TEMPLATE } from "@/lib/snippetTemplate";

// The snippet template's first section — tasks pulled from the "내 할 일 참고"
// panel are dropped in here ("오늘 한 일" = what I did today).
const TODAY_HEADING = SNIPPET_TEMPLATE.split("\n")[0]; // "#### 오늘 한 일"

/**
 * Insert bullet lines under the "오늘 한 일" heading of a snippet draft, appending
 * after any content already in that section and dropping the empty "-" placeholder.
 * If the heading is missing (template cleared), fall back to appending at the end.
 */
function insertUnderTodayHeading(draft: string, text: string): string {
  const insertLines = text.replace(/\n+$/, "").split("\n");
  const lines = draft.split("\n");
  const h = lines.findIndex((l) => l.trim() === TODAY_HEADING);
  if (h === -1) {
    const base = draft.trim() ? draft.replace(/\n*$/, "\n") : "";
    return base + insertLines.join("\n") + "\n";
  }
  // Section body runs from just after the heading to the next "#### " heading (or EOF).
  let e = lines.length;
  for (let i = h + 1; i < lines.length; i++) {
    if (lines[i].startsWith("#### ")) {
      e = i;
      break;
    }
  }
  const body = lines.slice(h + 1, e);
  // Keep existing bullets, but drop blank lines and the lone "-" placeholder.
  const content = body.filter((l) => l.trim() !== "" && l.trim() !== "-");
  const rebuilt = [TODAY_HEADING, "", ...content, ...insertLines, ""];
  return [...lines.slice(0, h), ...rebuilt, ...lines.slice(e)].join("\n");
}

export default function SnippetsPage() {
  const [scope, setScope] = useState<"own" | "team">("own");
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  // AI 제안 (organize) + AI 채점 (feedback) state for the write box.
  const [organizing, setOrganizing] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [scoring, setScoring] = useState(false);
  const [feedback, setFeedback] = useState<{ ai_score: number | null; feedback: string | null } | null>(
    null
  );

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

  // Drop task text pulled from the "내 할 일 참고" panel into the "오늘 한 일" section.
  function insertIntoDraft(text: string) {
    setDraft((prev) => insertUnderTodayHeading(prev, text));
  }

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

  // AI 제안: ask the AI to reorganize the current draft (does not save).
  async function runOrganize() {
    if (!draft.trim()) return;
    setOrganizing(true);
    setError(null);
    try {
      const res = await snippetsApi.organize(draft);
      setSuggestion(res.organized_content);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "AI 제안에 실패했습니다");
    } finally {
      setOrganizing(false);
    }
  }

  // AI 채점: grade today's snippet. Saves the current draft first (feedback
  // runs against the saved snippet on the server).
  async function runFeedback() {
    if (!draft.trim()) return;
    setScoring(true);
    setError(null);
    try {
      if (!myToday) await snippetsApi.create(draft);
      else if (draft !== myToday.content) await snippetsApi.update(myToday.id, draft);
      const res = await snippetsApi.feedback();
      setFeedback(res);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "AI 채점에 실패했습니다");
    } finally {
      setScoring(false);
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
          <SnippetTasks onInsert={insertIntoDraft} />

          <Textarea
            rows={14}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="font-mono text-xs leading-relaxed"
            placeholder="오늘 한 일, 블로커, 배운 점 등을 자유롭게 기록하세요. 'AI 제안'으로 정리하고 'AI 채점'으로 점수(0~100)를 받아보세요."
          />

          {/* AI 제안 결과 */}
          {suggestion !== null && (
            <div className="rounded-lg border border-accent/40 bg-accent/5 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-accent">AI 제안 (정리본)</span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(suggestion);
                      setSuggestion(null);
                    }}
                    className="text-xs font-medium text-accent hover:underline"
                  >
                    적용
                  </button>
                  <button
                    type="button"
                    onClick={() => setSuggestion(null)}
                    className="text-xs text-text-tertiary hover:text-text-secondary"
                  >
                    닫기
                  </button>
                </div>
              </div>
              <p className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-text-primary">
                {suggestion}
              </p>
            </div>
          )}

          {/* AI 채점 결과 */}
          {feedback !== null && <FeedbackPanel result={feedback} onClose={() => setFeedback(null)} />}

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="ghost" onClick={runOrganize} disabled={organizing || !draft.trim()}>
              {organizing ? <Spinner className="h-4 w-4" /> : "AI 제안"}
            </Button>
            <Button variant="secondary" onClick={runFeedback} disabled={scoring || !draft.trim()}>
              {scoring ? <Spinner className="h-4 w-4 border-white/40 border-t-white" /> : "AI 채점"}
            </Button>
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

function FeedbackPanel({
  result,
  onClose,
}: {
  result: { ai_score: number | null; feedback: string | null };
  onClose: () => void;
}) {
  // `feedback` is a JSON string from GCS Pulse (e.g. {"total_score":86,"scores":{...},...}).
  // Render the score prominently, a per-category breakdown when present, and any
  // text fields; fall back to the raw string if it isn't parseable JSON.
  const parsed = useMemo(() => {
    if (!result.feedback) return null;
    try {
      const data = JSON.parse(result.feedback);
      return typeof data === "object" && data !== null ? (data as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }, [result.feedback]);

  const breakdown =
    parsed && typeof parsed.scores === "object" && parsed.scores !== null
      ? Object.entries(parsed.scores as Record<string, unknown>).filter(
          ([, v]) => typeof v === "number" || typeof v === "string"
        )
      : [];

  // Any remaining string-valued fields become comment paragraphs.
  const comments = parsed
    ? Object.entries(parsed).filter(
        ([k, v]) => typeof v === "string" && k !== "total_score" && k !== "scores"
      )
    : [];

  return (
    <div className="rounded-lg border border-accent-secondary/40 bg-accent-secondary/5 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-accent-secondary">AI 채점 결과</span>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-text-tertiary hover:text-text-secondary"
        >
          닫기
        </button>
      </div>

      {result.ai_score !== null ? (
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-semibold text-text-primary">{result.ai_score}</span>
          <span className="text-sm text-text-tertiary">/ 100</span>
        </div>
      ) : (
        <p className="text-sm text-text-tertiary">점수를 불러오지 못했습니다.</p>
      )}

      {breakdown.length > 0 && (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-1">
          {breakdown.map(([k, v]) => (
            <li key={k} className="flex items-center justify-between text-xs">
              <span className="text-text-secondary">{k}</span>
              <span className="font-mono text-text-primary">{String(v)}</span>
            </li>
          ))}
        </ul>
      )}

      {comments.map(([k, v]) => (
        <p key={k} className="whitespace-pre-wrap text-sm text-text-primary">
          {String(v)}
        </p>
      ))}

      {!parsed && result.feedback && (
        <p className="whitespace-pre-wrap text-sm text-text-primary">{result.feedback}</p>
      )}
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
