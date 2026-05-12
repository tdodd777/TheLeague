import { cn } from "@/lib/cn";

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fillGradient?: boolean;
  className?: string;
  ariaLabel?: string;
  /** Render the last value as a small dot at the end of the line. */
  endDot?: boolean;
  /**
   * When true, override `stroke` with a trend-direction tint:
   * `--trend-positive-soft` if the second half of the series averages above
   * the first half, `--trend-negative-soft` if below, neutral if flat.
   */
  tintTrend?: boolean;
}

function trendStroke(values: number[]): string {
  if (values.length < 4) return "var(--accent-primary)";
  const mid = Math.floor(values.length / 2);
  const firstHalf = values.slice(0, mid);
  const secondHalf = values.slice(mid);
  const avg = (xs: number[]) =>
    xs.length === 0 ? 0 : xs.reduce((s, n) => s + n, 0) / xs.length;
  const delta = avg(secondHalf) - avg(firstHalf);
  // Threshold: 5% of the series mean. Below threshold = flat, use neutral.
  const mean = avg(values);
  const threshold = Math.abs(mean) * 0.05;
  if (delta > threshold) return "var(--trend-positive-soft)";
  if (delta < -threshold) return "var(--trend-negative-soft)";
  return "var(--foreground-muted)";
}

export function Sparkline({
  values,
  width = 80,
  height = 24,
  stroke,
  fillGradient = false,
  className,
  ariaLabel,
  endDot = true,
  tintTrend = false,
}: SparklineProps) {
  const resolvedStroke =
    stroke ?? (tintTrend ? trendStroke(values) : "currentColor");
  if (values.length < 2) {
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className={cn("inline-block", className)}
        role="img"
        aria-label={ariaLabel ?? "sparkline"}
      />
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);
  const padY = 2;
  const innerH = height - padY * 2;

  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = padY + innerH - ((v - min) / range) * innerH;
    return [x, y] as const;
  });

  const path = points
    .map(([x, y], i) =>
      `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`,
    )
    .join(" ");

  const areaPath = `${path} L ${width.toFixed(2)} ${height.toFixed(2)} L 0 ${height.toFixed(2)} Z`;
  const lastPoint = points[points.length - 1];

  const gradId = `sparkline-grad-${values.length}-${values[0]}-${values[values.length - 1]}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn("inline-block overflow-visible", className)}
      role="img"
      aria-label={ariaLabel ?? "sparkline"}
    >
      {fillGradient ? (
        <defs>
          <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={resolvedStroke} stopOpacity={0.28} />
            <stop offset="100%" stopColor={resolvedStroke} stopOpacity={0} />
          </linearGradient>
        </defs>
      ) : null}
      {fillGradient ? (
        <path d={areaPath} fill={`url(#${gradId})`} />
      ) : null}
      <path
        d={path}
        fill="none"
        stroke={resolvedStroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {endDot && lastPoint ? (
        <circle
          cx={lastPoint[0]}
          cy={lastPoint[1]}
          r={2}
          fill={resolvedStroke}
        />
      ) : null}
    </svg>
  );
}
