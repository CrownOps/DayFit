"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Spinner } from "@/components/ui";
import { FullLogo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SidebarNav, MobileDrawerNav } from "@/components/AppNav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="flex-1 grid place-items-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-56 md:flex-col border-r border-border bg-surface p-4 gap-6 sticky top-0 h-screen">
        <FullLogo width={188} />
        <SidebarNav />
        <div className="mt-auto space-y-3">
          <ThemeToggle />
          <div className="text-xs text-text-tertiary truncate">{user.email}</div>
          <button
            onClick={logout}
            className="text-xs text-text-secondary hover:text-danger transition-colors"
          >
            로그아웃
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="md:hidden flex items-center justify-between gap-2 border-b border-border bg-surface px-4 py-3 sticky top-0 z-10">
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="메뉴 열기"
            className="text-xl leading-none text-text-primary px-1"
          >
            ☰
          </button>
          <FullLogo width={150} />
          <ThemeToggle />
        </header>

        <main className="flex-1 p-4 sm:p-6 md:pb-6 max-w-4xl w-full mx-auto">
          {children}
        </main>
      </div>

      <MobileDrawerNav open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}
