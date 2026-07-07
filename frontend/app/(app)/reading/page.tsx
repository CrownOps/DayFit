"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { booksApi } from "@/lib/resources";
import type { Book, BookScope, BookStatus } from "@/lib/types";
import { ApiError } from "@/lib/api";
import { Button, Card, Input, Label, Spinner, Textarea } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { clsx } from "@/lib/clsx";

const STATUS_META: Record<BookStatus, { label: string; dot: string; badge: string }> = {
  want: { label: "읽기 전", dot: "bg-text-tertiary", badge: "bg-bg text-text-secondary border border-border" },
  reading: { label: "진행 중", dot: "bg-accent", badge: "bg-accent/10 text-accent" },
  done: { label: "완료", dot: "bg-success", badge: "bg-success/10 text-success" },
};

const STATUS_ORDER: BookStatus[] = ["reading", "want", "done"];

function Stars({ value, className }: { value: number | null; className?: string }) {
  if (!value) return null;
  return (
    <span className={clsx("text-warning text-sm leading-none tracking-tight", className)} aria-label={`추천도 ${value}/5`}>
      {"★".repeat(value)}
      <span className="text-border">{"★".repeat(5 - value)}</span>
    </span>
  );
}

export default function ReadingPage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<BookScope>("own");
  const [filter, setFilter] = useState<BookStatus | "all">("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Book | null>(null);

  const isTeam = scope === "team";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setBooks(await booksApi.list(scope));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "불러오기에 실패했습니다");
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const c: Record<BookStatus, number> = { want: 0, reading: 0, done: 0 };
    for (const b of books) c[b.status]++;
    return c;
  }, [books]);

  const filtered = filter === "all" ? books : books.filter((b) => b.status === filter);

  async function changeStatus(book: Book, status: BookStatus) {
    // optimistic
    setBooks((prev) => prev.map((b) => (b.id === book.id ? { ...b, status } : b)));
    try {
      await booksApi.update(book.id, { status });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "상태 변경에 실패했습니다");
      load();
    }
  }

  async function remove(book: Book) {
    if (!confirm(`'${book.title}'을(를) 삭제할까요?`)) return;
    try {
      await booksApi.remove(book.id);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "삭제에 실패했습니다");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text-primary">독서</h1>
        {!isTeam && (
          <Button
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
          >
            + 책 추가
          </Button>
        )}
      </div>

      {/* Scope: my records vs team records (read-only) */}
      <div className="inline-flex rounded-lg border border-border bg-surface p-0.5">
        {[
          { key: "own" as const, label: "내 기록" },
          { key: "team" as const, label: "팀원 기록" },
        ].map((s) => (
          <button
            key={s.key}
            onClick={() => {
              setScope(s.key);
              setFilter("all");
            }}
            className={clsx(
              "px-3 py-1 rounded-md text-sm transition-colors",
              scope === s.key ? "bg-accent text-white" : "text-text-secondary"
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {/* Summary */}
      <section className="grid grid-cols-3 gap-3">
        {STATUS_ORDER.map((s) => (
          <Card key={s} className="flex flex-col items-center gap-1 py-3">
            <span className="text-2xl font-semibold font-mono text-text-primary">{counts[s]}</span>
            <span className="flex items-center gap-1.5 text-xs text-text-secondary">
              <span className={clsx("h-2 w-2 rounded-full", STATUS_META[s].dot)} />
              {STATUS_META[s].label}
            </span>
          </Card>
        ))}
      </section>

      {/* Status filter */}
      <div className="flex flex-wrap items-center gap-1.5">
        {[
          { key: "all" as const, label: "전체" },
          ...STATUS_ORDER.map((s) => ({ key: s, label: STATUS_META[s].label })),
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={clsx(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              filter === key
                ? "bg-accent text-white"
                : "bg-surface border border-border text-text-secondary hover:text-text-primary"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid place-items-center py-16">
          <Spinner className="h-8 w-8" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <p className="text-sm text-text-tertiary">
            {books.length === 0
              ? isTeam
                ? "아직 팀원이 등록한 책이 없습니다."
                : "아직 등록된 책이 없습니다. 읽었거나 읽고 싶은 책을 추가해보세요."
              : "이 상태에 해당하는 책이 없습니다."}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((book) => (
            <Card key={book.id} className="space-y-2">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-text-primary break-words">{book.title}</span>
                    <span
                      className={clsx(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        STATUS_META[book.status].badge
                      )}
                    >
                      {STATUS_META[book.status].label}
                    </span>
                    <Stars value={book.rating} />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 text-xs text-text-tertiary mt-0.5">
                    {book.author && <span>{book.author}</span>}
                    {isTeam && book.owner && (
                      <span className="inline-flex items-center gap-1 text-accent">
                        <span className="text-text-tertiary">·</span> {book.owner.name}
                      </span>
                    )}
                  </div>
                </div>
                {!isTeam && (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => {
                        setEditing(book);
                        setModalOpen(true);
                      }}
                      className="text-text-tertiary hover:text-text-primary text-sm px-1"
                    >
                      수정
                    </button>
                    <button
                      onClick={() => remove(book)}
                      className="text-text-tertiary hover:text-danger text-sm px-1"
                    >
                      삭제
                    </button>
                  </div>
                )}
              </div>

              {book.review && (
                <p className="text-sm text-text-secondary whitespace-pre-wrap break-words border-l-2 border-border pl-3">
                  {book.review}
                </p>
              )}

              {/* Quick status switch (own records only) */}
              {!isTeam && (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {STATUS_ORDER.map((s) => (
                    <button
                      key={s}
                      onClick={() => changeStatus(book, s)}
                      disabled={book.status === s}
                      className={clsx(
                        "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                        book.status === s
                          ? "bg-accent text-white cursor-default"
                          : "bg-bg border border-border text-text-secondary hover:text-text-primary"
                      )}
                    >
                      {STATUS_META[s].label}
                    </button>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <BookModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        book={editing}
        onSaved={() => {
          setModalOpen(false);
          load();
        }}
      />
    </div>
  );
}

function BookModal({
  open,
  onClose,
  book,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  book: Book | null;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [status, setStatus] = useState<BookStatus>("want");
  const [rating, setRating] = useState<number>(0);
  const [review, setReview] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (book) {
      setTitle(book.title);
      setAuthor(book.author);
      setStatus(book.status);
      setRating(book.rating ?? 0);
      setReview(book.review);
    } else {
      setTitle("");
      setAuthor("");
      setStatus("want");
      setRating(0);
      setReview("");
    }
    setError(null);
  }, [open, book]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body = {
        title: title.trim(),
        author: author.trim(),
        status,
        rating: rating > 0 ? rating : null,
        review: review.trim(),
      };
      if (book) await booksApi.update(book.id, body);
      else await booksApi.create(body);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "저장에 실패했습니다");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={book ? "책 수정" : "새 책"}>
      <form onSubmit={save} className="space-y-3">
        <div>
          <Label htmlFor="b-title">제목</Label>
          <Input id="b-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div>
          <Label htmlFor="b-author">저자 (선택)</Label>
          <Input id="b-author" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="예: 김영하" />
        </div>
        <div>
          <Label>상태</Label>
          <div className="flex gap-1.5">
            {STATUS_ORDER.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={clsx(
                  "flex-1 rounded-md py-1.5 text-sm transition-colors",
                  status === s
                    ? "bg-accent text-white"
                    : "bg-bg border border-border text-text-secondary"
                )}
              >
                {STATUS_META[s].label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label>추천도 (선택)</Label>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating((r) => (r === n ? 0 : n))}
                aria-label={`${n}점`}
                className={clsx(
                  "text-2xl leading-none transition-colors",
                  n <= rating ? "text-warning" : "text-border hover:text-warning/50"
                )}
              >
                ★
              </button>
            ))}
            {rating > 0 && (
              <span className="ml-2 text-xs font-mono text-text-tertiary">{rating}/5</span>
            )}
          </div>
        </div>
        <div>
          <Label htmlFor="b-review">추천 이유 / 감상 (선택)</Label>
          <Textarea
            id="b-review"
            rows={3}
            value={review}
            onChange={(e) => setReview(e.target.value)}
            placeholder="왜 추천하는지, 어떤 점이 좋았는지 기록해보세요."
          />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? <Spinner className="h-4 w-4 border-white/40 border-t-white" /> : "저장"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
