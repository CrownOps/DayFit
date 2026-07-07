"use client";

import { useCallback, useEffect, useState } from "react";
import { teamSpaceApi } from "@/lib/resources";
import type { TeamProfile, TeamRule } from "@/lib/types";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button, Card, Input, Label, Spinner, Textarea } from "@/components/ui";
import { Modal } from "@/components/Modal";

export default function TeamSpacePage() {
  const { user } = useAuth();
  const isAdmin = !!user?.is_admin;

  const [profile, setProfile] = useState<TeamProfile | null>(null);
  const [rules, setRules] = useState<TeamRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profileModal, setProfileModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, r] = await Promise.all([teamSpaceApi.profile(), teamSpaceApi.rules()]);
      setProfile(p);
      setRules(r);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "불러오기에 실패했습니다");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="grid place-items-center py-16">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">팀 스페이스</h1>
          <p className="text-sm text-text-secondary">우리 팀의 비전 · 미션 · 그라운드 룰</p>
        </div>
        {isAdmin && (
          <Button variant="ghost" onClick={() => setProfileModal(true)}>
            비전/미션 수정
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {/* Vision & mission */}
      <section className="grid gap-4 sm:grid-cols-2">
        <Card className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">🌱</span>
            <h2 className="text-sm font-semibold text-text-primary">비전</h2>
          </div>
          {profile?.vision ? (
            <p className="text-sm text-text-secondary whitespace-pre-wrap break-words">{profile.vision}</p>
          ) : (
            <p className="text-sm text-text-tertiary">
              {isAdmin ? "아직 비전이 없습니다. 수정에서 등록하세요." : "아직 등록된 비전이 없습니다."}
            </p>
          )}
        </Card>
        <Card className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">🎯</span>
            <h2 className="text-sm font-semibold text-text-primary">미션</h2>
          </div>
          {profile?.mission ? (
            <p className="text-sm text-text-secondary whitespace-pre-wrap break-words">{profile.mission}</p>
          ) : (
            <p className="text-sm text-text-tertiary">
              {isAdmin ? "아직 미션이 없습니다. 수정에서 등록하세요." : "아직 등록된 미션이 없습니다."}
            </p>
          )}
        </Card>
      </section>

      {/* Team rules */}
      <RulesSection
        rules={rules}
        isAdmin={isAdmin}
        onChanged={load}
        onError={(m) => setError(m)}
      />

      {isAdmin && (
        <ProfileModal
          open={profileModal}
          onClose={() => setProfileModal(false)}
          profile={profile}
          onSaved={() => {
            setProfileModal(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function RulesSection({
  rules,
  isAdmin,
  onChanged,
  onError,
}: {
  rules: TeamRule[];
  isAdmin: boolean;
  onChanged: () => void;
  onError: (msg: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const value = draft.trim();
    if (!value) return;
    setAdding(true);
    try {
      await teamSpaceApi.createRule(value);
      setDraft("");
      onChanged();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "추가에 실패했습니다");
    } finally {
      setAdding(false);
    }
  }

  async function saveEdit(id: number) {
    const value = editText.trim();
    if (!value) return;
    try {
      await teamSpaceApi.updateRule(id, { content: value });
      setEditingId(null);
      onChanged();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "수정에 실패했습니다");
    }
  }

  async function remove(id: number) {
    if (!confirm("이 팀룰을 삭제할까요?")) return;
    try {
      await teamSpaceApi.removeRule(id);
      onChanged();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "삭제에 실패했습니다");
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-text-primary">팀룰</h2>

      {rules.length === 0 ? (
        <Card>
          <p className="text-sm text-text-tertiary">
            {isAdmin ? "아직 팀룰이 없습니다. 아래에서 추가하세요." : "아직 등록된 팀룰이 없습니다."}
          </p>
        </Card>
      ) : (
        <Card className="divide-y divide-border p-0">
          {rules.map((rule, i) => (
            <div key={rule.id} className="flex items-start gap-3 p-3">
              <span className="mt-0.5 shrink-0 grid h-6 w-6 place-items-center rounded-full bg-accent/10 text-accent text-xs font-mono font-semibold">
                {i + 1}
              </span>
              {editingId === rule.id ? (
                <div className="flex-1 space-y-2">
                  <Textarea rows={2} value={editText} onChange={(e) => setEditText(e.target.value)} />
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="ghost" onClick={() => setEditingId(null)}>
                      취소
                    </Button>
                    <Button type="button" onClick={() => saveEdit(rule.id)}>
                      저장
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="flex-1 min-w-0 text-sm text-text-primary whitespace-pre-wrap break-words">
                    {rule.content}
                  </p>
                  {isAdmin && (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => {
                          setEditingId(rule.id);
                          setEditText(rule.content);
                        }}
                        className="text-text-tertiary hover:text-text-primary text-sm px-1"
                      >
                        수정
                      </button>
                      <button
                        onClick={() => remove(rule.id)}
                        className="text-text-tertiary hover:text-danger text-sm px-1"
                      >
                        삭제
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </Card>
      )}

      {isAdmin && (
        <form onSubmit={add} className="flex items-center gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="+ 팀룰 추가"
          />
          <Button type="submit" disabled={adding || !draft.trim()} className="shrink-0">
            추가
          </Button>
        </form>
      )}
    </section>
  );
}

function ProfileModal({
  open,
  onClose,
  profile,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  profile: TeamProfile | null;
  onSaved: () => void;
}) {
  const [vision, setVision] = useState("");
  const [mission, setMission] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setVision(profile?.vision ?? "");
    setMission(profile?.mission ?? "");
    setError(null);
  }, [open, profile]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await teamSpaceApi.updateProfile({ vision: vision.trim(), mission: mission.trim() });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "저장에 실패했습니다");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="비전 / 미션 수정">
      <form onSubmit={save} className="space-y-3">
        <div>
          <Label htmlFor="t-vision">비전</Label>
          <Textarea
            id="t-vision"
            rows={3}
            value={vision}
            onChange={(e) => setVision(e.target.value)}
            placeholder="팀이 지향하는 미래의 모습"
          />
        </div>
        <div>
          <Label htmlFor="t-mission">미션</Label>
          <Textarea
            id="t-mission"
            rows={3}
            value={mission}
            onChange={(e) => setMission(e.target.value)}
            placeholder="비전을 이루기 위해 우리가 하는 일"
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
