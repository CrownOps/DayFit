"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { tokenApi } from "@/lib/resources";
import type { GcsPulseQuota, TokenUsageLog } from "@/lib/types";
import { isoDate } from "@/lib/dates";
import { ApiError } from "@/lib/api";
import { Button, Card, Input, Label, Spinner } from "@/components/ui";
import { clsx } from "@/lib/clsx";

const MODELS = ["claude-opus-4", "claude-sonnet-4", "claude-haiku-4"];

export default function TokensPage() {
  const [quota, setQuota] = useState<GcsPulseQuota | null>(null);
  const [quotaError, setQuotaError] = useState<string | null>(null);
  const [logs, setLogs] = useState<TokenUsageLog[]>([]);
  const [scope, setScope] = useState<"own" | "team">("own");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // manual entry
  const [date, setDate] = useState(isoDate(new Date()));
  const [model, setModel] = useState(MODELS[1]);
  const [inTok, setInTok] = useState("");
  const [outTok, setOutTok] = useState("");
  const [saving, setSaving] = useState(false);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const l = await tokenApi.list(scope);
      setLogs(l);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "불러오기에 실패했습니다");
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  useEffect(() => {
    tokenApi
      .quota()
      .then(setQuota)
      .catch((err) => setQuotaError(err instanceof ApiError ? err.message : "쿼터 조회 실패"));
  }, []);

  async function addManual(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await tokenApi.addManual({
        date,
        model,
        input_tokens: Number(inTok) || 0,
        output_tokens: Number(outTok) || 0,
      });
      setInTok("");
      setOutTok("");
      await loadLogs();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "저장에 실패했습니다");
    } finally {
      setSaving(false);
    }
  }

  async function removeLog(id: number) {
    try {
      await tokenApi.removeManual(id);
      await loadLogs();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "삭제에 실패했습니다");
    }
  }

  const totals = useMemo(() => {
    return logs.reduce(
      (acc, l) => {
        acc.input += l.input_tokens;
        acc.output += l.output_tokens;
        acc.cost += l.estimated_cost_usd;
        return acc;
      },
      { input: 0, output: 0, cost: 0 }
    );
  }, [logs]);

  const usedPct = quota ? Math.min(100, Math.round((quota.used / quota.allocated) * 100)) : 0;
  const gaugeColor = usedPct >= 90 ? "bg-danger" : usedPct >= 70 ? "bg-warning" : "bg-success";

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-text-primary">토큰 사용량</h1>

      {/* GCS Pulse quota gauge */}
      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-text-primary">GCS Pulse 토큰 쿼터</h2>
        {quotaError ? (
          <p className="text-sm text-text-tertiary">
            쿼터를 불러올 수 없습니다. 설정에서 GCS Pulse API 토큰을 등록했는지 확인하세요.
          </p>
        ) : !quota ? (
          <Spinner className="h-5 w-5" />
        ) : (
          <>
            <div className="flex items-center justify-between text-xs text-text-secondary">
              <span className="font-mono">
                {quota.used.toLocaleString()} / {quota.allocated.toLocaleString()}
              </span>
              <span className="font-mono">{usedPct}%</span>
            </div>
            <div className="h-2.5 rounded-full bg-border overflow-hidden">
              <div className={clsx("h-full rounded-full", gaugeColor)} style={{ width: `${usedPct}%` }} />
            </div>
            <div className="text-xs text-text-tertiary">
              잔여 {quota.remaining.toLocaleString()} · 다음 리셋{" "}
              {new Date(quota.next_reset).toLocaleString("ko-KR")}
            </div>
          </>
        )}
      </Card>

      {/* Manual entry */}
      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-text-primary">사용량 직접 입력</h2>
        <p className="text-xs text-text-tertiary">
          ccusage 등으로 확인한 오늘 사용량을 모델별로 기록하세요.
        </p>
        <form onSubmit={addManual} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="t-date">날짜</Label>
              <Input id="t-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="t-model">모델</Label>
              <select
                id="t-model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
              >
                {MODELS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="t-in">입력 토큰</Label>
              <Input id="t-in" type="number" min={0} value={inTok} onChange={(e) => setInTok(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="t-out">출력 토큰</Label>
              <Input id="t-out" type="number" min={0} value={outTok} onChange={(e) => setOutTok(e.target.value)} />
            </div>
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end">
            <Button type="submit" disabled={saving}>
              {saving ? <Spinner className="h-4 w-4 border-white/40 border-t-white" /> : "기록 추가"}
            </Button>
          </div>
        </form>
      </Card>

      {/* Logs */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">사용 기록</h2>
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
                {s === "own" ? "내 사용량" : "팀 합산"}
              </button>
            ))}
          </div>
        </div>

        <Card className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-secondary">합계</span>
            <span className="font-mono text-text-primary">
              in {totals.input.toLocaleString()} · out {totals.output.toLocaleString()} · $
              {totals.cost.toFixed(4)}
            </span>
          </div>
        </Card>

        {loading ? (
          <div className="grid place-items-center py-8">
            <Spinner className="h-6 w-6" />
          </div>
        ) : logs.length === 0 ? (
          <Card>
            <p className="text-sm text-text-tertiary">기록이 없습니다.</p>
          </Card>
        ) : (
          <Card className="p-0 divide-y divide-border">
            {logs.map((l) => (
              <div key={l.id} className="flex items-center gap-3 p-3 text-sm">
                <span className="font-mono text-text-tertiary w-24 shrink-0">{l.date}</span>
                <span className="flex-1 min-w-0 truncate text-text-primary">{l.model}</span>
                <span className="font-mono text-text-secondary text-xs">
                  {l.input_tokens.toLocaleString()}/{l.output_tokens.toLocaleString()} · ${l.estimated_cost_usd.toFixed(4)}
                </span>
                {l.source === "manual" && scope === "own" && (
                  <button onClick={() => removeLog(l.id)} className="text-text-tertiary hover:text-danger text-xs">
                    삭제
                  </button>
                )}
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
