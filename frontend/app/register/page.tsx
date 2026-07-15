"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { Button, Card, ErrorAlert, Input, Label, Spinner } from "@/components/ui";
import { FullLogo } from "@/components/Logo";

export default function RegisterPage() {
  const { user, loading, register } = useAuth();
  const router = useRouter();
  const [inviteCode, setInviteCode] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/today");
  }, [user, loading, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await register({ invite_code: inviteCode.trim(), email, name, password });
      router.replace("/onboarding");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "회원가입에 실패했습니다");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex-1 grid place-items-center p-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <FullLogo width={240} />
          <h1 className="mt-5 text-xl font-semibold text-text-primary">회원가입</h1>
          <p className="text-sm text-text-secondary mt-1">관리자에게 받은 초대 코드가 필요합니다</p>
        </div>

        <Card>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <Label htmlFor="invite">초대 코드</Label>
              <Input
                id="invite"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder="예: eIQxPFwzXv2V"
                required
              />
            </div>
            <div>
              <Label htmlFor="name">이름</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="email">이메일</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="password">비밀번호</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            <ErrorAlert>{error}</ErrorAlert>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? <Spinner className="h-4 w-4 border-white/40 border-t-white" /> : "가입하기"}
            </Button>
          </form>
        </Card>

        <p className="text-center text-sm text-text-secondary mt-4">
          이미 계정이 있으신가요?{" "}
          <Link href="/login" className="text-accent font-medium hover:underline">
            로그인
          </Link>
        </p>
      </div>
    </div>
  );
}
