"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { calendarApi, integrationsApi, pushApi, usersApi } from "@/lib/resources";
import type { GoogleIntegration, PushSubscriptionRow } from "@/lib/types";
import Link from "next/link";
import { ApiError } from "@/lib/api";
import { Button, Card, Input, Label, Spinner } from "@/components/ui";
import { ThemeToggle } from "@/components/ThemeToggle";
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
      <GoogleCalendarSection connected={user?.google_calendar_connected ?? false} />
      {user?.is_admin && <GoogleIntegrationAdminSection />}
      <GcsPulseSection />
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
          {error && <p className="text-sm text-danger">{error}</p>}
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
      setError("Google 연동이 아직 설정되지 않았습니다. 관리자가 아래에서 값을 입력해야 합니다.");
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
        <p className="text-sm text-success">✓ 연결됨</p>
      ) : (
        <>
          <p className="text-xs text-text-tertiary">
            연결하면 일정을 가져오고, 이 앱에서 만든 일정이 캘린더에 동기화됩니다. 캘린더 자체 알림은 꺼집니다.
          </p>
          {configured === false && (
            <p className="text-xs text-warning">
              아직 Google 연동이 설정되지 않았습니다. 관리자가 아래 &quot;Google 연동 설정&quot;에서 값을 입력해야 연결할 수 있습니다.
            </p>
          )}
          <Button onClick={connect} disabled={busy || configured === false}>
            {busy ? <Spinner className="h-4 w-4 border-white/40 border-t-white" /> : "Google Calendar 연결"}
          </Button>
        </>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </Card>
  );
}

function GoogleIntegrationAdminSection() {
  const [data, setData] = useState<GoogleIntegration | null>(null);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [redirectUri, setRedirectUri] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const g = await integrationsApi.getGoogle();
      setData(g);
      setClientId(g.client_id ?? "");
      setRedirectUri(g.redirect_uri ?? "");
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
      const g = await integrationsApi.setGoogle({
        client_id: clientId.trim(),
        client_secret: clientSecret.trim() || undefined,
        redirect_uri: redirectUri.trim() || undefined,
      });
      setData(g);
      setClientSecret("");
      setMsg("저장되었습니다. 이제 위에서 'Google Calendar 연결'을 눌러 연결하세요.");
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
        <h2 className="text-sm font-semibold text-text-primary">Google 연동 설정 (관리자)</h2>
        {data && (
          <span className={data.configured ? "text-xs text-success" : "text-xs text-warning"}>
            {data.configured ? "설정됨" : "미설정"}
          </span>
        )}
      </div>
      <p className="text-xs text-text-tertiary">
        Google Cloud Console에서 만든 OAuth 2.0 클라이언트(웹 애플리케이션)의 값을 입력하세요. 아래 리디렉션 URI를
        &quot;승인된 리디렉션 URI&quot;에 그대로 등록해야 합니다.
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
            placeholder={data?.configured ? "저장됨 (변경 시에만 입력)" : "GOCSPX-..."}
          />
        </div>
        <div className="space-y-1">
          <Label>리디렉션 URI (선택 — 비우면 위 값 자동 사용)</Label>
          <Input
            value={redirectUri}
            onChange={(e) => setRedirectUri(e.target.value)}
            placeholder={callback}
          />
        </div>
      </div>

      <Button onClick={save} disabled={busy || !clientId.trim()}>
        {busy ? <Spinner className="h-4 w-4 border-white/40 border-t-white" /> : "저장"}
      </Button>
      {msg && <p className="text-sm text-text-secondary">{msg}</p>}
      {error && <p className="text-sm text-danger">{error}</p>}
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
