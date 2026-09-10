import Link from "next/link";

import { ManagerAvatar } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { BarRow } from "@/lib/landing/visuals";

interface BarListProps {
  rows: readonly BarRow[];
  /** ranked: bars from the left, scaled to the top row. diverging: from a center line, green right, red left. */
  mode: "ranked" | "diverging";
  format: (value: number) => string;
}

/**
 * Twelve rows, one bar each. Names link to the manager page. Built from
 * divs so it reads at 375px without a chart library.
 */
export function BarList({ rows, mode, format }: BarListProps) {
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 0) || 1;
  return (
    <ol className="flex flex-col gap-1.5">
      {rows.map((row, i) => {
        const share = Math.abs(row.value) / max;
        return (
          <li key={row.manager.userId} className="flex items-center gap-2.5 min-w-0">
            <Link
              href={`/managers/${row.manager.username}`}
              className="flex items-center gap-2 w-[9.5rem] sm:w-44 shrink-0 min-w-0 group focus-hairline"
            >
              <ManagerAvatar manager={row.manager} size={22} ring="subtle" />
              <span className="text-[12px] text-foreground truncate group-hover:text-accent transition-colors">
                {row.manager.displayName}
              </span>
            </Link>
            <span
              className="relative h-3 flex-1 min-w-0 rounded-full bg-foreground/[0.05] overflow-hidden"
              role="img"
              aria-label={`${row.manager.displayName}: ${format(row.value)}`}
            >
              {mode === "ranked" ? (
                <span
                  className={cn(
                    "absolute inset-y-0 left-0 rounded-full",
                    i === 0 ? "bg-accent" : "bg-foreground/25",
                  )}
                  style={{ width: `${Math.max(3, share * 100)}%` }}
                />
              ) : (
                <>
                  <span className="absolute inset-y-0 left-1/2 w-px bg-foreground/20" aria-hidden />
                  <span
                    className={cn(
                      "absolute inset-y-0 rounded-full",
                      row.value >= 0 ? "left-1/2 bg-positive" : "right-1/2 bg-negative",
                    )}
                    style={{ width: `${Math.max(1, share * 50)}%` }}
                  />
                </>
              )}
            </span>
            <span
              className={cn(
                "w-14 shrink-0 text-right text-[12px] tabular",
                mode === "diverging"
                  ? row.value >= 0
                    ? "text-positive"
                    : "text-negative"
                  : "text-foreground",
              )}
            >
              {format(row.value)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
