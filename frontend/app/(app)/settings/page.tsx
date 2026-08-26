"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { calendarApi, gmailApi, integrationsApi, pushApi, teamSpaceApi, usersApi } from "@/lib/resources";
import type { MyGoogleIntegration, PushSubscriptionRow, TeamEditPolicy, TeamPermissions } from "@/lib/types";
import Link from "next/link";
import { ApiError } from "@/lib/api";
import { Button, Card, ErrorAlert, Input, Label, Spinner } from "@/components/ui";
import { ThemeToggle } from "@/components/ThemeToggle";
import { clsx } from "@/lib/clsx";
import { InstallPrompt } from "@/components/InstallPrompt";
import {
  getExistingSubscription,
  isStandalone,
  pushSupported,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/push";

export default function SettingsPage() {
  const { user, logout } = useAuth();

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-text-primary">설정</h1>

      <InstallPrompt />

      {/* Appearance */}
      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-text-primary">테마</h2>
        <div className="flex items-center justify-between">
          <span className="text-sm text-text-secondary">라이트 / 다크 / 시스템</span>
          <ThemeToggle />
        </div>
      </Card>

      <PushSection />
      <GoogleClientSection />
      <GoogleCalendarSection connected={user?.google_calendar_connected ?? false} />
      <GmailSection connected={user?.gmail_connected ?? false} />
      <GcsPulseSection />
      {user?.is_admin && <TeamPermissionsSection />}
      {user?.is_admin && (
        <Card className="space-y-2">
          <h2 className="text-sm font-semibold text-text-primary">관리자</h2>
          <p className="text-xs text-text-tertiary">초대 코드 발급은 관리자 페이지에서 관리합니다.</p>
          <Link href="/admin" className="text-sm text-accent font-medium hover:underline">
            관리자 페이지로 이동 →
          </Link>
        </Card>
      )}

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-text-primary">계정</h2>
        <div className="text-sm text-text-secondary">{user?.email}</div>
        <Button variant="danger" onClick={logout}>
          로그아웃
        </Button>
      </Card>
    </div>
  );
}

function PushSection() {
  const [supported, setSupported] = useState(true);
  const [subscribed, setSubscribed] = useState(false);
  const [devices, setDevices] = useState<PushSubscriptionRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [standalone, setStandalone] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const sub = await getExistingSubscription();
      setSubscribed(!!sub);
      setDevices(await pushApi.list());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    setSupported(pushSupported());
    setStandalone(isStandalone());
    refresh();
  }, [refresh]);

  async function subscribe() {
    setBusy(true);
    setError(null);
    try {
      await subscribeToPush(navigator.userAgent.slice(0, 60));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "구독에 실패했습니다");
    } finally {
      setBusy(false);
    }
  }

  async function unsubscribe() {
    setBusy(true);
    setError(null);
    try {
      await unsubscribeFromPush();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "해제에 실패했습니다");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-3">
      <h2 className="text-sm font-semibold text-text-primary">알림 (웹 푸시)</h2>
      {!supported ? (
        <p className="text-sm text-text-tertiary">이 브라우저는 웹 푸시를 지원하지 않습니다.</p>
      ) : (
        <>
          {!standalone && (
            <p className="text-xs text-warning">
              아이폰은 &quot;홈 화면에 추가&quot;로 설치한 뒤에만 알림을 받을 수 있습니다.
            </p>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">
              이 기기 {subscribed ? "구독됨" : "구독 안 됨"}
            </span>
            {subscribed ? (
              <Button variant="ghost" onClick={unsubscribe} disabled={busy}>
                구독 해제
              </Button>
            ) : (
              <Button onClick={subscribe} disabled={busy}>
                {busy ? <Spinner className="h-4 w-4 border-white/40 border-t-white" /> : "알림 켜기"}
              </Button>
            )}
          </div>
          {devices.length > 0 && (
            <div className="text-xs text-text-tertiary space-y-1">
              <div>등록된 기기 {devices.length}대</div>
            </div>
          )}
          <ErrorAlert>{error}</ErrorAlert>
        </>
      )}
    </Card>
  );
}

function GoogleCalendarSection({ connected }: { connected: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    integrationsApi
      .googleStatus()
      .then((s) => setConfigured(s.configured))
      .catch(() => setConfigured(false));
    // Surface the callback outcome from the OAuth redirect.
    const params = new URLSearchParams(window.location.search);
    if (params.get("calendar") === "not_configured") {
      setError("Google 연동이 아직 설정되지 않았습니다. 위 'Google API 연결'에서 본인 Client ID/Secret을 먼저 입력하세요.");
    } else if (params.get("calendar") === "error") {
      setError("Google Calendar 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    }
  }, []);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const { auth_url } = await calendarApi.authorizeUrl();
      window.location.href = auth_url;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "연결에 실패했습니다");
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-3">
      <h2 className="text-sm font-semibold text-text-primary">Google Calendar</h2>
      {connected ? (
        <>
          <p className="text-sm text-success">✓ 연결됨</p>
          <Button variant="ghost" onClick={connect} disabled={busy}>
            {busy ? <Spinner className="h-4 w-4 border-white/40 border-t-white" /> : "다시 연결"}
          </Button>
        </>
      ) : (
        <>
          <p className="text-xs text-text-tertiary">
            연결하면 일정을 가져오고, 이 앱에서 만든 일정이 캘린더에 동기화됩니다. 캘린더 자체 알림은 꺼집니다.
            이메일과는 별도로 연결되므로, 이메일과 다른 Google 계정을 선택해도 됩니다.
          </p>
          {configured === false && (
            <p className="text-xs text-warning">
              아직 Google API가 설정되지 않았습니다. 위 &quot;Google API 연결&quot;에서 본인 Client ID/Secret을 먼저 입력하세요.
            </p>
          )}
          <Button onClick={connect} disabled={busy || configured === false}>
            {busy ? <Spinner className="h-4 w-4 border-white/40 border-t-white" /> : "Google Calendar 연결"}
          </Button>
        </>
      )}
      <ErrorAlert>{error}</ErrorAlert>
    </Card>
  );
}

function GmailSection({ connected }: { connected: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    integrationsApi
      .googleStatus()
      .then((s) => setConfigured(s.configured))
      .catch(() => setConfigured(false));
    // Surface the callback outcome from the OAuth redirect.
    const params = new URLSearchParams(window.location.search);
    if (params.get("gmail") === "not_configured") {
      setError("Google 연동이 아직 설정되지 않았습니다. 위 'Google API 연결'에서 본인 Client ID/Secret을 먼저 입력하세요.");
    } else if (params.get("gmail") === "error") {
      setError("이메일 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    }
  }, []);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const { auth_url } = await gmailApi.authorizeUrl();
      window.location.href = auth_url;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "연결에 실패했습니다");
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-3">
      <h2 className="text-sm font-semibold text-text-primary">이메일 (Gmail)</h2>
      {connected ? (
        <>
          <p className="text-sm text-success">✓ 연결됨</p>
          <Button variant="ghost" onClick={connect} disabled={busy}>
            {busy ? <Spinner className="h-4 w-4 border-white/40 border-t-white" /> : "다시 연결"}
          </Button>
        </>
      ) : (
        <>
          <p className="text-xs text-text-tertiary">
            연결하면 이메일 페이지에서 받은편지함/보낸편지함을 조회할 수 있습니다. Google Calendar와는 별도로
            연결되므로, 캘린더와 다른 Google 계정을 선택해도 됩니다.
          </p>
          {configured === false && (
            <p className="text-xs text-warning">
              아직 Google API가 설정되지 않았습니다. 위 &quot;Google API 연결&quot;에서 본인 Client ID/Secret을 먼저 입력하세요.
            </p>
          )}
          <Button onClick={connect} disabled={busy || configured === false}>
            {busy ? <Spinner className="h-4 w-4 border-white/40 border-t-white" /> : "이메일 연결"}
          </Button>
        </>
      )}
      <ErrorAlert>{error}</ErrorAlert>
    </Card>
  );
}

/** 팀룰 · 비전/미션의 수정 권한 (관리자 전용 설정).
 *
 * 정책이 "팀원 전체"면 팀원 누구나 해당 항목을 수정할 수 있고, "관리자만"이면
 * 관리자만 수정할 수 있다. 관리자는 정책과 무관하게 항상 수정 가능하다. */
function TeamPermissionsSection() {
  const [perms, setPerms] = useState<TeamPermissions | null>(null);
  const [busy, setBusy] = useState<keyof TeamPermissions | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    teamSpaceApi
      .permissions()
      .then(setPerms)
      .catch((err) => setError(err instanceof ApiError ? err.message : "불러오기에 실패했습니다"));
  }, []);

  async function setPolicy(field: "rules_edit_policy" | "profile_edit_policy", value: TeamEditPolicy) {
    if (!perms || perms[field] === value || busy) return;
    setBusy(field);
    setError(null);
    try {
      setPerms(await teamSpaceApi.updatePermissions({ [field]: value }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "저장에 실패했습니다");
    } finally {
      setBusy(null);
    }
  }

  const ROWS: { field: "rules_edit_policy" | "profile_edit_policy"; label: string }[] = [
    { field: "rules_edit_policy", label: "팀룰 수정" },
    { field: "profile_edit_policy", label: "비전 · 미션 수정" },
  ];

  return (
    <Card className="space-y-3">
      <h2 className="text-sm font-semibold text-text-primary">팀 스페이스 권한</h2>
      <p className="text-xs text-text-tertiary">
        팀룰과 비전·미션을 누가 수정할 수 있는지 정합니다. 관리자는 설정과 무관하게 항상 수정할 수 있습니다.
      </p>
      {perms === null ? (
        <Spinner className="h-4 w-4" />
      ) : (
        ROWS.map((row) => (
          <div key={row.field} className="flex items-center justify-between gap-2">
            <span className="text-sm text-text-secondary">{row.label}</span>
            <div className="inline-flex rounded-lg border border-border bg-surface p-0.5">
              {(["admin", "member"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPolicy(row.field, value)}
                  disabled={busy !== null}
                  className={clsx(
                    "px-3 py-1 rounded-md text-sm transition-colors disabled:opacity-60",
                    perms[row.field] === value ? "bg-accent text-white" : "text-text-secondary"
                  )}
                >
                  {value === "admin" ? "관리자만" : "팀원 전체"}
                </button>
              ))}
            </div>
          </div>
        ))
      )}
      <ErrorAlert>{error}</ErrorAlert>
    </Card>
  );
}

function GoogleClientSection() {
  const [data, setData] = useState<MyGoogleIntegration | null>(null);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const g = await integrationsApi.getMyGoogle();
      setData(g);
      setClientId(g.client_id ?? "");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "불러오기에 실패했습니다");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const g = await integrationsApi.setMyGoogle({
        client_id: clientId.trim(),
        client_secret: clientSecret.trim() || undefined,
      });
      setData(g);
      setClientSecret("");
      setMsg("저장되었습니다. 아래 'Google Calendar 연결'을 눌러 본인 캘린더를 연결하세요.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "저장에 실패했습니다");
    } finally {
      setBusy(false);
    }
  }

  const callback = data?.suggested_callback_url ?? "";

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-primary">Google API 연결</h2>
        {data && (
          <span className={data.configured ? "text-xs text-success" : "text-xs text-warning"}>
            {data.configured ? "설정됨" : "미설정"}
          </span>
        )}
      </div>
      <p className="text-xs text-text-tertiary">
        본인 Google Cloud Console에서 만든 OAuth 2.0 클라이언트(웹 애플리케이션)의 값을 입력하세요. 각자 자기
        캘린더를 연결합니다. 아래 리디렉션 URI를 본인 클라이언트의 &quot;승인된 리디렉션 URI&quot;에 그대로 등록해야
        합니다.
      </p>

      {callback && (
        <div className="rounded-md border border-border bg-bg p-2">
          <div className="text-xs text-text-tertiary">승인된 리디렉션 URI (복사해서 Google Console에 등록)</div>
          <code className="block break-all text-xs text-text-secondary">{callback}</code>
        </div>
      )}

      <div className="space-y-2">
        <div className="space-y-1">
          <Label>Client ID</Label>
          <Input
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="xxxxx.apps.googleusercontent.com"
          />
        </div>
        <div className="space-y-1">
          <Label>Client Secret</Label>
          <Input
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder={data?.has_secret ? "저장됨 (변경 시에만 입력)" : "GOCSPX-..."}
          />
        </div>
      </div>

      <Button onClick={save} disabled={busy || !clientId.trim()}>
        {busy ? <Spinner className="h-4 w-4 border-white/40 border-t-white" /> : "저장"}
      </Button>
      {msg && <p className="text-sm text-text-secondary">{msg}</p>}
      <ErrorAlert>{error}</ErrorAlert>
    </Card>
  );
}

function GcsPulseSection() {
  const [status, setStatus] = useState<boolean | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    usersApi
      .gcsPulseStatus()
      .then((s) => setStatus(s.connected))
      .catch(() => setStatus(false));
  }, []);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await usersApi.setGcsPulseToken(token.trim());
      setToken("");
      setStatus(true);
      setMsg("저장되었습니다.");
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : "저장에 실패했습니다");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-3">
      <h2 className="text-sm font-semibold text-text-primary">GCS Pulse API 토큰</h2>
      <p className="text-xs text-text-tertiary">
        데일리 스니펫과 토큰 쿼터 조회에 필요합니다. GCS Pulse 계정 설정에서 발급받은 토큰을 입력하세요.
        {status !== null && (
          <span className={status ? "text-success" : "text-warning"}> · {status ? "등록됨" : "미등록"}</span>
        )}
      </p>
      <div className="flex gap-2">
        <Input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="API_TOKEN"
        />
        <Button onClick={save} disabled={busy || !token.trim()}>
          저장
        </Button>
      </div>
      {msg && <p className="text-sm text-text-secondary">{msg}</p>}
    </Card>
  );
}
