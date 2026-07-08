"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { bottlenecksApi } from "@/lib/resources";
import type {
  Bottleneck,
  BottleneckAction,
  BottleneckInput,
  BottleneckPriority,
  BottleneckStatus,
} from "@/lib/types";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Badge, Button, Card, Input, Label, Spinner, Textarea } from "@/components/ui";
import { clsx } from "@/lib/clsx";

// ---- Label / colour maps ----
const PRIORITY_LABEL: Record<BottleneckPriority, string> = { high: "높음", medium: "보통", low: "낮음" };
const PRIORITY_COLOR: Record<BottleneckPriority, "danger" | "warning" | "accent"> = {
  high: "danger",
  medium: "warning",
  low: "accent",
};
const STATUS_LABEL: Record<BottleneckStatus, string> = {
  open: "발생",
  in_progress: "진행 중",
  resolved: "해결됨",
};
const STATUS_COLOR: Record<BottleneckStatus, "secondary" | "warning" | "success"> = {
  open: "secondary",
  in_progress: "warning",
  resolved: "success",
};

const PRIORITIES: BottleneckPriority[] = ["high", "medium", "low"];
const STATUSES: BottleneckStatus[] = ["open", "in_progress", "resolved"];

// ---- Datetime helpers (local wall-clock, no timezone shifting) ----
const pad = (n: number) => String(n).padStart(2, "0");

/** Date -> "YYYY-MM-DDTHH:mm" for <input type="datetime-local">. */
function toInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

function fmt(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

function isOverdue(b: Bottleneck): boolean {
  return b.deadline != null && b.status !== "resolved" && new Date(b.deadline).getTime() < Date.now();
}

export default function BottlenecksPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Bottleneck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [statusFilter, setStatusFilter] = useState<BottleneckStatus | "all">("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await bottlenecksApi.list());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "불러오기에 실패했습니다");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const c = { all: items.length, open: 0, in_progress: 0, resolved: 0 };
    for (const b of items) c[b.status] += 1;
    return c;
  }, [items]);

  const visible = useMemo(
    () => (statusFilter === "all" ? items : items.filter((b) => b.status === statusFilter)),
    [items, statusFilter]
  );

  async function createBottleneck(input: BottleneckInput) {
    await bottlenecksApi.create(input);
    setCreating(false);
    await load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">병목</h1>
          <p className="text-sm text-text-secondary">팀·프로젝트의 병목을 등록하고 우선순위로 관리하세요.</p>
        </div>
        <Button onClick={() => setCreating((v) => !v)}>{creating ? "닫기" : "+ 새 병목"}</Button>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {creating && (
        <Card>
          <BottleneckForm
            submitLabel="등록"
            onSubmit={createBottleneck}
            onCancel={() => setCreating(false)}
          />
        </Card>
      )}

      {/* Status filter */}
      <div className="flex flex-wrap items-center gap-2">
        {(["all", "open", "in_progress", "resolved"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={clsx(
              "rounded-full px-3 py-1 text-xs font-medium border transition-colors",
              statusFilter === s
                ? "bg-accent text-white border-accent"
                : "border-border text-text-secondary hover:border-accent"
            )}
          >
            {s === "all" ? "전체" : STATUS_LABEL[s]} · {counts[s]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid place-items-center py-12">
          <Spinner className="h-6 w-6" />
        </div>
      ) : visible.length === 0 ? (
        <Card>
          <p className="text-sm text-text-tertiary">
            {items.length === 0 ? "아직 등록된 병목이 없습니다. 새 병목을 등록해 보세요." : "조건에 맞는 병목이 없습니다."}
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {visible.map((b) => (
            <BottleneckCard
              key={b.id}
              bottleneck={b}
              currentUserId={user?.id ?? null}
              isAdmin={!!user?.is_admin}
              onChanged={load}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create / edit form
// ---------------------------------------------------------------------------
function BottleneckForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: Bottleneck;
  submitLabel: string;
  onSubmit: (input: BottleneckInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [priority, setPriority] = useState<BottleneckPriority>(initial?.priority ?? "medium");
  const [status, setStatus] = useState<BottleneckStatus>(initial?.status ?? "open");
  const [occurredAt, setOccurredAt] = useState(
    initial ? toInput(new Date(initial.occurred_at)) : toInput(new Date())
  );
  const [deadline, setDeadline] = useState(
    initial?.deadline ? toInput(new Date(initial.deadline)) : ""
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      await onSubmit({
        title: title.trim(),
        description,
        priority,
        status,
        occurred_at: occurredAt || null,
        deadline: deadline || null,
      });
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : "저장에 실패했습니다");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <Label>제목</Label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="병목 상황을 한 줄로"
          autoFocus
        />
      </div>
      <div>
        <Label>설명</Label>
        <Textarea
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="어떤 병목인지, 왜 발생했는지 등"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>우선순위</Label>
          <Select value={priority} onChange={(v) => setPriority(v as BottleneckPriority)}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>상태</Label>
          <Select value={status} onChange={(v) => setStatus(v as BottleneckStatus)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>발생 일시</Label>
          <Input
            type="datetime-local"
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
            required
          />
        </div>
        <div>
          <Label>데드라인</Label>
          <Input
            type="datetime-local"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />
        </div>
      </div>
      {err && <p className="text-sm text-danger">{err}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          취소
        </Button>
        <Button type="submit" disabled={saving || !title.trim()}>
          {saving ? <Spinner className="h-4 w-4 border-white/40 border-t-white" /> : submitLabel}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Bottleneck card
// ---------------------------------------------------------------------------
function BottleneckCard({
  bottleneck: b,
  currentUserId,
  isAdmin,
  onChanged,
}: {
  bottleneck: Bottleneck;
  currentUserId: number | null;
  isAdmin: boolean;
  onChanged: () => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const canManage = isAdmin || b.creator?.id === currentUserId;

  const doneCount = b.actions.filter((a) => a.done).length;

  async function patch(body: Partial<BottleneckInput>) {
    setBusy(true);
    try {
      await bottlenecksApi.update(b.id, body);
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("이 병목을 삭제할까요? 등록된 액션도 함께 삭제됩니다.")) return;
    setBusy(true);
    try {
      await bottlenecksApi.remove(b.id);
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <Card>
        <BottleneckForm
          initial={b}
          submitLabel="저장"
          onCancel={() => setEditing(false)}
          onSubmit={async (input) => {
            await bottlenecksApi.update(b.id, input);
            setEditing(false);
            await onChanged();
          }}
        />
      </Card>
    );
  }

  return (
    <Card className={clsx("space-y-3", busy && "opacity-60")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge color={PRIORITY_COLOR[b.priority]}>{PRIORITY_LABEL[b.priority]}</Badge>
            <Badge color={STATUS_COLOR[b.status]}>{STATUS_LABEL[b.status]}</Badge>
            <h2 className="text-base font-semibold text-text-primary break-words">{b.title}</h2>
          </div>
          <p className="text-xs text-text-tertiary">
            작성자 {b.creator?.name ?? "알 수 없음"} · 발생 {fmt(b.occurred_at)}
            {b.deadline && (
              <span className={clsx(isOverdue(b) && "text-danger font-medium")}>
                {" · 데드라인 "}
                {fmt(b.deadline)}
                {isOverdue(b) ? " (지남)" : ""}
              </span>
            )}
          </p>
        </div>
        {canManage && (
          <div className="flex shrink-0 items-center gap-2 text-xs">
            <button onClick={() => setEditing(true)} className="text-text-secondary hover:text-accent">
              수정
            </button>
            <button onClick={remove} className="text-text-tertiary hover:text-danger">
              삭제
            </button>
          </div>
        )}
      </div>

      {b.description && (
        <p className="whitespace-pre-wrap text-sm text-text-primary">{b.description}</p>
      )}

      {/* Quick status / priority controls (any teammate) */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs text-text-secondary">
          상태
          <Select value={b.status} onChange={(v) => patch({ status: v as BottleneckStatus })} compact>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-text-secondary">
          우선순위
          <Select
            value={b.priority}
            onChange={(v) => patch({ priority: v as BottleneckPriority })}
            compact
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </Select>
        </label>
      </div>

      {/* Actions */}
      <div className="border-t border-border pt-3 space-y-2">
        <p className="text-xs font-semibold text-text-secondary">
          해결 액션 {b.actions.length > 0 && `(${doneCount}/${b.actions.length} 완료)`}
        </p>
        {b.actions.length === 0 && (
          <p className="text-xs text-text-tertiary">아직 등록된 액션이 없습니다.</p>
        )}
        {b.actions.map((a) => (
          <ActionRow
            key={a.id}
            bottleneckId={b.id}
            action={a}
            canDelete={isAdmin || a.creator?.id === currentUserId}
            onChanged={onChanged}
          />
        ))}
        <AddActionForm bottleneckId={b.id} onChanged={onChanged} />
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Action row + add form
// ---------------------------------------------------------------------------
function ActionRow({
  bottleneckId,
  action: a,
  canDelete,
  onChanged,
}: {
  bottleneckId: number;
  action: BottleneckAction;
  canDelete: boolean;
  onChanged: () => Promise<void> | void;
}) {
  const [editingEffect, setEditingEffect] = useState(false);
  const [effectDraft, setEffectDraft] = useState(a.effect);
  const [busy, setBusy] = useState(false);

  async function toggleDone() {
    setBusy(true);
    try {
      await bottlenecksApi.updateAction(bottleneckId, a.id, { done: !a.done });
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function saveEffect() {
    setBusy(true);
    try {
      await bottlenecksApi.updateAction(bottleneckId, a.id, { effect: effectDraft });
      setEditingEffect(false);
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await bottlenecksApi.removeAction(bottleneckId, a.id);
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={clsx("rounded-lg border border-border bg-surface p-2.5 space-y-1.5", busy && "opacity-60")}>
      <div className="flex items-start gap-2">
        <button
          onClick={toggleDone}
          aria-label={a.done ? "완료 취소" : "완료"}
          className={clsx(
            "mt-0.5 h-4 w-4 shrink-0 rounded border-2 grid place-items-center transition-colors",
            a.done ? "bg-success border-success text-white" : "border-border hover:border-accent"
          )}
        >
          {a.done && <span className="text-[10px] leading-none">✓</span>}
        </button>
        <span
          className={clsx(
            "flex-1 min-w-0 text-sm break-words",
            a.done ? "text-text-tertiary line-through" : "text-text-primary"
          )}
        >
          {a.content}
        </span>
        {canDelete && (
          <button
            onClick={remove}
            aria-label="액션 삭제"
            className="shrink-0 text-text-tertiary hover:text-danger text-xs"
          >
            ✕
          </button>
        )}
      </div>

      {/* Effect */}
      {editingEffect ? (
        <div className="pl-6 space-y-1.5">
          <Textarea
            rows={2}
            value={effectDraft}
            onChange={(e) => setEffectDraft(e.target.value)}
            placeholder="액션 수행 후 효과를 기록하세요"
            className="text-sm"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setEffectDraft(a.effect);
                setEditingEffect(false);
              }}
              className="text-xs text-text-tertiary hover:text-text-secondary"
            >
              취소
            </button>
            <button
              type="button"
              onClick={saveEffect}
              className="text-xs font-medium text-accent hover:underline"
            >
              저장
            </button>
          </div>
        </div>
      ) : (
        <div className="pl-6 flex items-start gap-2">
          {a.effect ? (
            <p className="flex-1 text-xs text-text-secondary whitespace-pre-wrap">
              <span className="text-text-tertiary">효과 · </span>
              {a.effect}
            </p>
          ) : (
            <span className="flex-1 text-xs text-text-tertiary">효과 미기록</span>
          )}
          <button
            type="button"
            onClick={() => setEditingEffect(true)}
            className="shrink-0 text-xs text-accent hover:underline"
          >
            {a.effect ? "효과 수정" : "효과 기록"}
          </button>
        </div>
      )}

      <p className="pl-6 text-[11px] text-text-tertiary">{a.creator?.name ?? "알 수 없음"}</p>
    </div>
  );
}

function AddActionForm({
  bottleneckId,
  onChanged,
}: {
  bottleneckId: number;
  onChanged: () => Promise<void> | void;
}) {
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = content.trim();
    if (!value || busy) return;
    setBusy(true);
    try {
      await bottlenecksApi.addAction(bottleneckId, { content: value });
      setContent("");
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2 pt-1">
      <input
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="+ 해결 액션 추가"
        className="flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent outline-none"
      />
      <button
        type="submit"
        disabled={busy || !content.trim()}
        className="shrink-0 rounded-lg bg-accent text-white px-3 py-1.5 text-sm font-medium hover:bg-accent-hover disabled:opacity-50"
      >
        추가
      </button>
    </form>
  );
}

// Small styled <select> wrapper matching the app's inputs.
function Select({
  value,
  onChange,
  children,
  compact,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={clsx(
        "rounded-lg border border-border bg-surface text-text-primary focus:border-accent outline-none",
        compact ? "px-2 py-1 text-xs" : "w-full px-3 py-2 text-sm"
      )}
    >
      {children}
    </select>
  );
}
