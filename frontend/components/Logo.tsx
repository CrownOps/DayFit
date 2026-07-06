"use client";

import Image from "next/image";
import { clsx } from "@/lib/clsx";
import { useEffectiveTheme } from "@/lib/theme";

/** The block-mark icon only (transparent, works on any background). */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  const markRatio = 1172 / 1251; // w/h of the trimmed mark
  return (
    <Image
      src="/logo-mark.png"
      alt="DayFit"
      width={Math.round(size * markRatio)}
      height={size}
      className={clsx("object-contain", className)}
      priority
    />
  );
}

/** Icon + wordmark. Wordmark is HTML text so it adapts to the theme color. */
export function LogoLockup({ className }: { className?: string }) {
  return (
    <div className={clsx("flex items-center gap-2", className)}>
      <LogoMark size={30} />
      <span className="text-lg font-semibold tracking-tight text-text-primary">DayFit</span>
    </div>
  );
}

/**
 * Full lockup with slogan, theme-aware. Uses the dark-ink asset on light
 * backgrounds and the white asset on dark backgrounds so the text stays legible.
 */
export function FullLogo({ className, width = 260 }: { className?: string; width?: number }) {
  const theme = useEffectiveTheme();
  // Fall back to the mark until the theme resolves (prevents wrong-contrast flash).
  const src = theme === "dark" ? "/logo-lockup-dark.png" : "/logo-lockup-light.png";
  const ratio = 3983 / 1251; // cropped lockup aspect ratio

  return (
    <Image
      src={src}
      alt="DayFit — Fit your day, find your rhythm"
      width={width}
      height={Math.round(width / ratio)}
      className={clsx("object-contain", !theme && "opacity-0", className)}
      priority
    />
  );
}
