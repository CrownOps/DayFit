"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "@/lib/clsx";
import { useAuth } from "@/lib/auth";
import { ThemeToggle } from "@/components/ThemeToggle";

interface NavItem {
  href: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/home", label: "홈", icon: "⌂" },
  { href: "/today", label: "일정", icon: "◷" },
  { href: "/tasks", label: "할 일", icon: "☑" },
  { href: "/bottlenecks", label: "병목", icon: "⚠" },
  { href: "/habits", label: "데일리 루틴", icon: "✓" },
  { href: "/reading", label: "독서", icon: "❑" },
  { href: "/snippets", label: "스니펫", icon: "▦" },
  { href: "/team", label: "헬스체크", icon: "◍" },
  { href: "/team-space", label: "팀룰", icon: "⚑" },
  { href: "/rooms", label: "회의실", icon: "▣" },
  { href: "/email", label: "이메일", icon: "✉" },
  { href: "/admin", label: "관리자", icon: "★", adminOnly: true },
  { href: "/settings", label: "설정", icon: "⚙" },
];

function useVisibleItems(): NavItem[] {
  const { user } = useAuth();
  return NAV_ITEMS.filter((item) => !item.adminOnly || user?.is_admin);
}

/** Desktop sidebar. */
export function SidebarNav() {
  const pathname = usePathname();
  const items = useVisibleItems();
  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={clsx(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-accent text-white"
                : "text-text-secondary hover:bg-bg hover:text-text-primary"
            )}
          >
            <span className="text-base w-5 text-center">{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Mobile slide-in drawer, opened from a hamburger button in the mobile header. */
export function MobileDrawerNav({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const items = useVisibleItems();
  const { user, logout } = useAuth();

  // Close automatically when the route changes.
  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-30 md:hidden">
      <button
        aria-label="메뉴 닫기"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div className="absolute inset-y-0 left-0 w-64 max-w-[80vw] bg-surface border-r border-border p-4 flex flex-col gap-6 overflow-y-auto">
        <nav className="flex flex-col gap-1">
          {items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-accent text-white"
                    : "text-text-secondary hover:bg-bg hover:text-text-primary"
                )}
              >
                <span className="text-base w-5 text-center">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto space-y-3">
          <ThemeToggle />
          <div className="text-xs text-text-tertiary truncate">{user?.email}</div>
          <button
            onClick={logout}
            className="text-xs text-text-secondary hover:text-danger transition-colors"
          >
            로그아웃
          </button>
        </div>
      </div>
    </div>
  );
}
