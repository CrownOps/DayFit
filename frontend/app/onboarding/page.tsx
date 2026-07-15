"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { usersApi } from "@/lib/resources";
import { ApiError } from "@/lib/api";
import { Button, Card, ErrorAlert, Input, Label, Spinner } from "@/components/ui";
import { FullLogo } from "@/components/Logo";

export default function OnboardingPage() {
  const { user, loading, refresh } = useAuth();
  const router = useRouter();

  const [teamCode, setTeamCode] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  // Prefill the team code from the invite-assigned team_id.
  useEffect(() => {
    if (user?.team_id) setTeamCode(user.team_id);
  }, [user?.team_id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await usersApi.completeOnboarding(teamCode.trim(), apiToken.trim());
      await refresh();
      router.replace("/snippets");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "저장에 실패했습니다");
    } finally {
      setSaving(false);
    }
  }

  async function skip() {
    router.replace("/today");
  }

  if (loading || !user) {
    return (
      <div className="flex-1 grid place-items-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="flex-1 grid place-items-center p-6">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <FullLogo width={220} />
        </div>

        <Card className="space-y-4">
          <div>
            <h1 className="text-lg font-semibold text-text-primary">팀 연동 설정</h1>
            <p className="text-sm text-text-secondary mt-1">
              데일리 스니펫과 팀 헬스체크를 사용하려면 팀 코드와 본인 GCS Pulse API 토큰을 입력하세요.
              먼저 본인 기록이 보이고, 팀 전체 기록도 함께 볼 수 있습니다.
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="team">팀 코드</Label>
              <Input
                id="team"
                value={teamCode}
                onChange={(e) => setTeamCode(e.target.value)}
                placeholder="예: 78I8M9OE"
                required
              />
              <p className="text-xs text-text-tertiary mt-1">
                CrownOps 팀의 GCS Pulse 팀 코드입니다. (초대 시 지정된 값이 자동 입력됩니다)
              </p>
            </div>
            <div>
              <Label htmlFor="token">본인 GCS Pulse API 토큰</Label>
              <Input
                id="token"
                type="password"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                placeholder="API_TOKEN"
                required
              />
              <p className="text-xs text-text-tertiary mt-1">
                GCS Pulse 계정 설정에서 발급받은 개인 토큰. 서버에 암호화되어 저장됩니다.
              </p>
            </div>

            <ErrorAlert>{error}</ErrorAlert>

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={skip}
                className="text-sm text-text-tertiary hover:text-text-secondary"
              >
                나중에 하기
              </button>
              <Button type="submit" disabled={saving || !teamCode.trim() || !apiToken.trim()}>
                {saving ? <Spinner className="h-4 w-4 border-white/40 border-t-white" /> : "연동하고 시작"}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
