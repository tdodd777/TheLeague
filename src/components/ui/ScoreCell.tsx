import { ArrowDown, ArrowUp } from "lucide-react";

import { cn } from "@/lib/cn";

interface ScoreCellProps {
  value: number;
  precision?: 0 | 1 | 2;
  className?: string;
  emphasis?: "primary" | "muted";
  /** When set, renders a colored arrow with the value's sign before the number. */
  diff?: number | null;
}

export function ScoreCell({
  value,
  precision = 2,
  className,
  emphasis = "primary",
  diff,
}: ScoreCellProps) {
  const formatted = value.toLocaleString("en-US", {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });

  const showDiff = typeof diff === "number" && diff !== 0;
  const positive = (diff ?? 0) > 0;

  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-1.5 tabular",
        emphasis === "primary" ? "text-foreground" : "text-foreground-muted",
        className,
      )}
    >
      {showDiff ? (
        <span
          className={cn(
            "inline-flex items-center gap-0.5 text-[10px] font-medium",
            positive ? "text-positive" : "text-negative",
          )}
        >
          {positive ? (
            <ArrowUp size={10} strokeWidth={2.5} />
          ) : (
            <ArrowDown size={10} strokeWidth={2.5} />
          )}
          {Math.abs(diff ?? 0).toLocaleString("en-US", {
            minimumFractionDigits: precision,
            maximumFractionDigits: precision,
          })}
        </span>
      ) : null}
      <span>{formatted}</span>
    </span>
  );
}
