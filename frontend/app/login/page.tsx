"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { Button, Card, Input, Label, Spinner } from "@/components/ui";
import { FullLogo } from "@/components/Logo";

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/home");
  }, [user, loading, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      router.replace("/home");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "로그인에 실패했습니다");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex-1 grid place-items-center p-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <FullLogo width={280} />
        </div>

        <Card>
          <form onSubmit={onSubmit} className="space-y-4">
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
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? <Spinner className="h-4 w-4 border-white/40 border-t-white" /> : "로그인"}
            </Button>
          </form>
        </Card>

        <p className="text-center text-sm text-text-secondary mt-4">
          초대 코드를 받으셨나요?{" "}
          <Link href="/register" className="text-accent font-medium hover:underline">
            회원가입
          </Link>
        </p>
      </div>
    </div>
  );
}
