"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { gmailApi } from "@/lib/resources";
import type { EmailDetail, EmailFolder, EmailSummary, GmailStatus } from "@/lib/types";
import { ApiError } from "@/lib/api";
import { Button, Card, ErrorAlert, Spinner } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { clsx } from "@/lib/clsx";

const FOLDERS: { key: EmailFolder; label: string }[] = [
  { key: "inbox", label: "받은편지함" },
  { key: "sent", label: "보낸편지함" },
];

function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function EmailPage() {
  const [folder, setFolder] = useState<EmailFolder>("inbox");
  const [messages, setMessages] = useState<EmailSummary[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Which Google account these messages come from. Gmail has its own OAuth
  // token (separate from Calendar), so it can be pointed at a different
  // account — and switched — right from this page.
  const [account, setAccount] = useState<GmailStatus | null>(null);
  const [connecting, setConnecting] = useState(false);

  const [selected, setSelected] = useState<EmailDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // One pass: resolve which account is connected, then (only if there is one)
  // fetch that folder's messages.
  const load = useCallback(async (f: EmailFolder) => {
    setLoading(true);
    setError(null);
    try {
      let status: GmailStatus | null = null;
      try {
        status = await gmailApi.status();
      } catch {
        status = null;
      }
      setAccount(status);

      // Surface (and then clear) the outcome of an OAuth round trip we started.
      const result = new URLSearchParams(window.location.search).get("gmail");
      if (result === "not_configured") {
        setError("Google API가 설정되지 않았습니다. 설정에서 본인 Client ID/Secret을 먼저 입력하세요.");
      } else if (result === "error") {
        setError("이메일 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      }
      if (result) window.history.replaceState(null, "", window.location.pathname);

      if (!status?.connected) {
        // Nothing to fetch — the account bar explains what to do next.
        setMessages([]);
        setNextPageToken(null);
        return;
      }

      const data = await gmailApi.list(f);
      setMessages(data.messages);
      setNextPageToken(data.next_page_token);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "메일을 불러오지 못했습니다");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(folder);
  }, [folder, load]);

  /** Start (or switch) the Gmail connection. Google always shows its account
   * chooser, so this is also how the user picks a different inbox. */
  async function connectAccount() {
    setConnecting(true);
    setError(null);
    try {
      const { auth_url } = await gmailApi.authorizeUrl("/email");
      window.location.href = auth_url;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "연결에 실패했습니다");
      setConnecting(false);
    }
  }

  async function disconnectAccount() {
    if (!confirm("이메일 계정 연결을 해제할까요? 캘린더 연결은 그대로 유지됩니다.")) return;
    setConnecting(true);
    setError(null);
    try {
      await gmailApi.disconnect();
      await load(folder);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "연결 해제에 실패했습니다");
    } finally {
      setConnecting(false);
    }
  }

  async function loadMore() {
    if (!nextPageToken) return;
    setLoadingMore(true);
    try {
      const data = await gmailApi.list(folder, nextPageToken);
      setMessages((prev) => [...prev, ...data.messages]);
      setNextPageToken(data.next_page_token);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "메일을 불러오지 못했습니다");
    } finally {
      setLoadingMore(false);
    }
  }

  async function openMessage(id: string) {
    setModalOpen(true);
    setDetailLoading(true);
    setDetailError(null);
    setSelected(null);
    try {
      const detail = await gmailApi.get(id);
      setSelected(detail);
    } catch (err) {
      setDetailError(err instanceof ApiError ? err.message : "메일을 불러오지 못했습니다");
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text-primary">이메일</h1>
        <div className="inline-flex rounded-lg border border-border bg-surface p-0.5">
          {FOLDERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFolder(f.key)}
              className={clsx(
                "px-3 py-1 rounded-md text-sm transition-colors",
                folder === f.key ? "bg-accent text-white" : "text-text-secondary"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <AccountBar
        account={account}
        busy={connecting}
        onConnect={connectAccount}
        onDisconnect={disconnectAccount}
      />

      <ErrorAlert>{error}</ErrorAlert>

      {!account?.connected ? null : loading ? (
        <div className="grid place-items-center py-16">
          <Spinner className="h-8 w-8" />
        </div>
      ) : messages.length === 0 ? (
        // The specific failure is already shown in the ErrorAlert above.
        <Card>
          <p className="text-sm text-text-tertiary">
            {error ? "메일을 불러오지 못했습니다." : "메일이 없습니다."}
          </p>
        </Card>
      ) : (
        <>
          <Card className="p-0 divide-y divide-border">
            {messages.map((m) => (
              <button
                key={m.id}
                onClick={() => openMessage(m.id)}
                className="flex w-full items-start gap-3 p-3 text-left hover:bg-bg transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={clsx("truncate text-sm", m.unread ? "font-semibold text-text-primary" : "text-text-secondary")}>
                      {m.from_}
                    </span>
                    <span className="shrink-0 text-xs text-text-tertiary">{formatDate(m.date)}</span>
                  </div>
                  <div className={clsx("truncate text-sm", m.unread ? "font-semibold text-text-primary" : "text-text-secondary")}>
                    {m.subject}
                  </div>
                  <div className="truncate text-xs text-text-tertiary">{m.snippet}</div>
                </div>
              </button>
            ))}
          </Card>
          {nextPageToken && (
            <div className="flex justify-center">
              <Button variant="ghost" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? <Spinner className="h-4 w-4" /> : "더 불러오기"}
              </Button>
            </div>
          )}
        </>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={selected?.subject ?? "메일"}>
        {detailLoading ? (
          <div className="grid place-items-center py-8">
            <Spinner className="h-6 w-6" />
          </div>
        ) : detailError ? (
          <ErrorAlert>{detailError}</ErrorAlert>
        ) : selected ? (
          <div className="space-y-3">
            <div className="space-y-1 text-xs text-text-tertiary">
              <div>
                <span className="text-text-secondary">보낸이</span> {selected.from_}
              </div>
              <div>
                <span className="text-text-secondary">받는이</span> {selected.to_}
              </div>
              <div>{formatDate(selected.date)}</div>
            </div>
            <div className="max-h-96 overflow-y-auto whitespace-pre-wrap text-sm text-text-primary border-t border-border pt-3">
              {selected.body_text || selected.snippet}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

/** Shows which Gmail account the page is reading, with connect / switch /
 * disconnect controls. Gmail's token is stored separately from Calendar's, so
 * switching here never touches the calendar connection. */
function AccountBar({
  account,
  busy,
  onConnect,
  onDisconnect,
}: {
  account: GmailStatus | null;
  busy: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  if (account === null) {
    return (
      <Card className="flex items-center gap-2">
        <Spinner className="h-4 w-4" />
        <span className="text-sm text-text-tertiary">계정 정보를 확인하는 중…</span>
      </Card>
    );
  }

  if (!account.connected) {
    return (
      <Card className="space-y-2">
        <p className="text-sm text-text-secondary">연결된 이메일 계정이 없습니다.</p>
        {account.configured ? (
          <p className="text-xs text-text-tertiary">
            연결할 Google 계정을 선택하세요. 캘린더와 다른 계정을 골라도 됩니다.
          </p>
        ) : (
          <p className="text-xs text-warning">
            먼저 <Link href="/settings" className="text-accent underline">설정</Link>에서 본인 Google
            API(Client ID/Secret)를 입력해야 합니다.
          </p>
        )}
        <Button onClick={onConnect} disabled={busy || !account.configured}>
          {busy ? <Spinner className="h-4 w-4 border-white/40 border-t-white" /> : "이메일 계정 연결"}
        </Button>
      </Card>
    );
  }

  return (
    <Card className="flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0">
        <div className="text-xs text-text-tertiary">연결된 계정</div>
        <div className="truncate text-sm text-text-primary">
          {account.email ?? "연결됨 (주소를 불러오지 못했습니다)"}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="ghost" onClick={onConnect} disabled={busy}>
          계정 전환
        </Button>
        <Button variant="ghost" onClick={onDisconnect} disabled={busy}>
          연결 해제
        </Button>
      </div>
    </Card>
  );
}
