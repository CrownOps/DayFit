"use client";

import { clsx } from "@/lib/clsx";

export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        "rounded-xl bg-surface border border-border p-4",
        "shadow-[var(--shadow-card)]",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
};

export function Button({
  className,
  variant = "primary",
  children,
  ...props
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const variants: Record<string, string> = {
    primary: "bg-accent text-white hover:bg-accent-hover",
    secondary:
      "bg-accent-secondary text-white hover:opacity-90",
    ghost:
      "bg-transparent text-text-secondary hover:bg-bg border border-border",
    danger: "bg-danger text-white hover:opacity-90",
  };
  return (
    <button className={clsx(base, variants[variant], className)} {...props}>
      {children}
    </button>
  );
}

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary",
        "placeholder:text-text-tertiary focus:border-accent outline-none",
        className
      )}
      {...props}
    />
  );
}

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={clsx(
        "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary",
        "placeholder:text-text-tertiary focus:border-accent outline-none resize-y",
        className
      )}
      {...props}
    />
  );
}

export function Label({
  className,
  children,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={clsx("block text-xs font-medium text-text-secondary mb-1", className)}
      {...props}
    >
      {children}
    </label>
  );
}

export function ErrorAlert({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  if (!children) return null;
  return (
    <div
      role="alert"
      className={clsx(
        "flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger",
        className
      )}
    >
      <span className="mt-px shrink-0" aria-hidden>
        ⚠
      </span>
      <span className="leading-snug whitespace-pre-line">{children}</span>
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={clsx(
        "h-5 w-5 animate-spin rounded-full border-2 border-border border-t-accent",
        className
      )}
    />
  );
}

export function Badge({
  children,
  color = "accent",
  className,
}: {
  children: React.ReactNode;
  color?: "accent" | "secondary" | "success" | "danger" | "warning";
  className?: string;
}) {
  const colors: Record<string, string> = {
    accent: "bg-accent text-white",
    secondary: "bg-accent-secondary text-white",
    success: "bg-success text-white",
    danger: "bg-danger text-white",
    warning: "bg-warning text-white",
  };
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium font-mono",
        colors[color],
        className
      )}
    >
      {children}
    </span>
  );
}
