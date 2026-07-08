"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "@/lib/clsx";
import { useAuth } from "@/lib/auth";

interface NavItem {
  href: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/home", label: "홈", icon: "⌂" },
  { href: "/today", label: "일정", icon: "◷" },
  { href: "/tasks", label: "할일", icon: "☑" },
  { href: "/bottlenecks", label: "병목", icon: "⚠" },
  { href: "/habits", label: "데일리 루틴", icon: "✓" },
  { href: "/reading", label: "독서", icon: "❑" },
  { href: "/snippets", label: "스니펫", icon: "▦" },
  { href: "/team", label: "헬스체크", icon: "◍" },
  { href: "/team-space", label: "팀룰", icon: "⚑" },
  { href: "/tokens", label: "토큰", icon: "∑" },
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

/** Mobile bottom nav. */
export function BottomNav() {
  const pathname = usePathname();
  const items = useVisibleItems();
  return (
    <nav className="fixed bottom-0 inset-x-0 z-20 flex border-t border-border bg-surface md:hidden pb-[env(safe-area-inset-bottom)]">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={clsx(
              "flex-1 flex flex-col items-center gap-0.5 py-2 text-[11px] transition-colors",
              active ? "text-accent" : "text-text-secondary"
            )}
          >
            <span className="text-lg leading-none">{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
