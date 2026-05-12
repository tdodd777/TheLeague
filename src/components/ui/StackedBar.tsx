import { cn } from "@/lib/cn";

export interface StackedBarSegment {
  key: string;
  value: number;
  color: string;
  label?: string;
}

interface StackedBarProps {
  segments: StackedBarSegment[];
  /** Optional total override for the divisor; otherwise sum of segment values. */
  total?: number;
  height?: number;
  showLegend?: boolean;
  /** Render percentages inside segments wide enough to fit text. */
  showInline?: boolean;
  className?: string;
  ariaLabel?: string;
}

export function StackedBar({
  segments,
  total,
  height = 14,
  showLegend = true,
  showInline = false,
  className,
  ariaLabel,
}: StackedBarProps) {
  const sum = total ?? segments.reduce((s, x) => s + Math.max(0, x.value), 0);
  const safeSum = sum > 0 ? sum : 1;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div
        className="flex w-full overflow-hidden rounded-md bg-foreground/[0.04]"
        style={{ height }}
        role="img"
        aria-label={ariaLabel}
      >
        {segments.map((seg) => {
          const pct = (Math.max(0, seg.value) / safeSum) * 100;
          if (pct <= 0) return null;
          return (
            <span
              key={seg.key}
              className="flex items-center justify-center text-[9px] font-medium tabular text-background/80"
              style={{ width: `${pct}%`, background: seg.color }}
              title={`${seg.label ?? seg.key}: ${seg.value.toFixed(0)} (${pct.toFixed(1)}%)`}
            >
              {showInline && pct >= 8 ? `${pct.toFixed(0)}%` : ""}
            </span>
          );
        })}
      </div>
      {showLegend ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-foreground-muted">
          {segments.map((seg) => {
            const pct = (Math.max(0, seg.value) / safeSum) * 100;
            return (
              <span key={seg.key} className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-2 rounded-sm"
                  style={{ background: seg.color }}
                  aria-hidden
                />
                <span className="tabular">
                  {seg.label ?? seg.key}{" "}
                  <span className="text-foreground-subtle">
                    {pct.toFixed(0)}%
                  </span>
                </span>
              </span>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
