"use client";

import { useTheme, type ThemePref } from "@/lib/theme";
import { clsx } from "@/lib/clsx";

const OPTIONS: { value: ThemePref; label: string; icon: string }[] = [
  { value: "light", label: "라이트", icon: "☀" },
  { value: "dark", label: "다크", icon: "☾" },
  { value: "system", label: "시스템", icon: "⌗" },
];

export function ThemeToggle() {
  const { pref, setTheme } = useTheme();
  return (
    <div className="inline-flex rounded-lg border border-border bg-surface p-0.5">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => setTheme(opt.value)}
          title={opt.label}
          aria-label={opt.label}
          className={clsx(
            "px-2 py-1 rounded-md text-sm transition-colors",
            pref === opt.value
              ? "bg-accent text-white"
              : "text-text-secondary hover:text-text-primary"
          )}
        >
          {opt.icon}
        </button>
      ))}
    </div>
  );
}
