"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { inviteApi } from "@/lib/resources";
import type { InviteCode } from "@/lib/types";
import { ApiError } from "@/lib/api";
import { Button, Card, ErrorAlert, Label, Spinner } from "@/components/ui";
import { clsx } from "@/lib/clsx";

export default function AdminPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [fetching, setFetching] = useState(true);
  const [creating, setCreating] = useState(false);
  const [expiresDays, setExpiresDays] = useState(7);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<number | null>(null);

  // Client-side guard (backend also enforces admin on these endpoints).
  useEffect(() => {
    if (!loading && user && !user.is_admin) router.replace("/today");
  }, [loading, user, router]);

  const load = useCallback(async () => {
    setFetching(true);
    try {
      setCodes(await inviteApi.list());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "불러오기 실패");
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    if (user?.is_admin) load();
  }, [user?.is_admin, load]);

  async function create() {
    setCreating(true);
    setError(null);
    try {
      await inviteApi.create(expiresDays > 0 ? expiresDays : null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "생성 실패");
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: number) {
    if (!confirm("이 초대 코드를 삭제할까요?")) return;
    try {
      await inviteApi.remove(id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "삭제 실패");
    }
  }

  function copy(code: string, id: number) {
    navigator.clipboard?.writeText(code);
    setCopied(id);
    setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
  }

  if (loading || !user) {
    return (
      <div className="grid place-items-center py-16">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (!user.is_admin) {
    return <p className="text-sm text-danger">이 페이지는 관리자만 접근할 수 있습니다.</p>;
  }

  const unused = codes.filter((c) => !c.used_by_user_id);
  const used = codes.filter((c) => c.used_by_user_id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">관리자</h1>
        <p className="text-sm text-text-secondary">초대 코드를 발급해 팀원을 추가하세요.</p>
      </div>

      {/* Create */}
      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-text-primary">초대 코드 발급</h2>
        <div className="flex items-end gap-3">
          <div className="w-32">
            <Label htmlFor="exp">유효기간 (일)</Label>
            <input
              id="exp"
              type="number"
              min={0}
              value={expiresDays}
              onChange={(e) => setExpiresDays(Number(e.target.value))}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
            />
          </div>
          <Button onClick={create} disabled={creating}>
            {creating ? <Spinner className="h-4 w-4 border-white/40 border-t-white" /> : "+ 발급"}
          </Button>
        </div>
        <p className="text-xs text-text-tertiary">0을 입력하면 만료되지 않는 코드가 발급됩니다.</p>
        <ErrorAlert>{error}</ErrorAlert>
      </Card>

      {/* Unused codes */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-text-primary">
          사용 가능한 코드 {unused.length > 0 && <span className="text-text-tertiary">({unused.length})</span>}
        </h2>
        {fetching ? (
          <div className="grid place-items-center py-8">
            <Spinner className="h-6 w-6" />
          </div>
        ) : unused.length === 0 ? (
          <Card>
            <p className="text-sm text-text-tertiary">사용 가능한 초대 코드가 없습니다. 위에서 발급하세요.</p>
          </Card>
        ) : (
          <Card className="p-0 divide-y divide-border">
            {unused.map((c) => (
              <div key={c.id} className="flex items-center gap-2 p-3">
                <code className="font-mono text-sm text-text-primary">{c.code}</code>
                <span className="text-xs text-text-tertiary">
                  {c.expires_at ? `~${c.expires_at.slice(0, 10)}` : "무기한"}
                </span>
                <span className="flex-1" />
                <button
                  onClick={() => copy(c.code, c.id)}
                  className={clsx(
                    "text-xs font-medium",
                    copied === c.id ? "text-success" : "text-accent hover:underline"
                  )}
                >
                  {copied === c.id ? "복사됨" : "복사"}
                </button>
                <button onClick={() => revoke(c.id)} className="text-xs text-text-tertiary hover:text-danger">
                  삭제
                </button>
              </div>
            ))}
          </Card>
        )}
      </section>

      {/* Used codes */}
      {used.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-text-primary">사용된 코드</h2>
          <Card className="p-0 divide-y divide-border">
            {used.map((c) => (
              <div key={c.id} className="flex items-center gap-2 p-3 text-sm">
                <code className="font-mono text-text-tertiary line-through">{c.code}</code>
                <span className="flex-1" />
                <span className="text-xs text-text-tertiary">
                  사용됨 {c.used_at ? `· ${c.used_at.slice(0, 10)}` : ""}
                </span>
              </div>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}
