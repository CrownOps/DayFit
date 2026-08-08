"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { gmailApi } from "@/lib/resources";
import type { EmailDetail, EmailFolder, EmailSummary } from "@/lib/types";
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

  const [selected, setSelected] = useState<EmailDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async (f: EmailFolder) => {
    setLoading(true);
    setError(null);
    try {
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

      {loading ? (
        <div className="grid place-items-center py-16">
          <Spinner className="h-8 w-8" />
        </div>
      ) : error ? (
        <Card>
          <p className="text-sm text-text-tertiary">
            메일을 불러올 수 없습니다. <Link href="/settings" className="text-accent underline">설정</Link>
            에서 이메일(Gmail) 연결을 확인하세요.
          </p>
        </Card>
      ) : messages.length === 0 ? (
        <Card>
          <p className="text-sm text-text-tertiary">메일이 없습니다.</p>
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
