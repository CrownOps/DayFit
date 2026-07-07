"use client";

export interface TrendPoint {
  date: string; // ISO YYYY-MM-DD
  score: number; // 0–10
}

function bandColor(score: number): string {
  if (score >= 7) return "var(--color-success)";
  if (score >= 4) return "var(--color-warning)";
  return "var(--color-danger)";
}

/**
 * Small line chart of a member's condition score (0–10) over [fromMs, toMs].
 * Line/area are drawn in a non-uniform SVG; point markers are absolutely
 * positioned so they stay perfectly round regardless of width.
 */
export function ConditionTrend({
  points,
  fromMs,
  toMs,
}: {
  points: TrendPoint[];
  fromMs: number;
  toMs: number;
}) {
  const span = Math.max(1, toMs - fromMs);
  const xFrac = (iso: string) => Math.min(1, Math.max(0, (Date.parse(iso) - fromMs) / span));
  const yFrac = (score: number) => 1 - Math.min(10, Math.max(0, score)) / 10;

  if (points.length === 0) {
    return <p className="text-xs text-text-tertiary">이 기간 컨디션 기록이 없습니다.</p>;
  }

  const coords = points.map((p) => ({ x: xFrac(p.date) * 100, y: yFrac(p.score) * 100, p }));
  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(2)},${c.y.toFixed(2)}`).join(" ");
  const areaPath =
    coords.length > 1
      ? `${linePath} L${coords[coords.length - 1].x.toFixed(2)},100 L${coords[0].x.toFixed(2)},100 Z`
      : "";

  return (
    <div className="relative h-16 w-full">
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full overflow-visible"
      >
        {/* Midline at score 5 */}
        <line x1="0" y1="50" x2="100" y2="50" stroke="var(--color-border)" strokeWidth="0.5" strokeDasharray="2 2" />
        {areaPath && <path d={areaPath} fill="var(--color-accent)" opacity="0.12" />}
        {coords.length > 1 && (
          <path d={linePath} fill="none" stroke="var(--color-accent)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      {/* Round point markers (non-distorting) */}
      {coords.map((c, i) => (
        <span
          key={i}
          title={`${c.p.date} · 컨디션 ${c.p.score}/10`}
          className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface"
          style={{ left: `${c.x}%`, top: `${c.y}%`, background: bandColor(c.p.score) }}
        />
      ))}
    </div>
  );
}
