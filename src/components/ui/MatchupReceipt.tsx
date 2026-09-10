import Link from "next/link";

import { ManagerAvatar } from "./ManagerAvatar";
import { Pill } from "./Pill";
import { getMatchupReceipt } from "@/lib/data/receipts";
import { cn } from "@/lib/cn";
import type { Manager } from "@/lib/types";

interface MatchupReceiptProps {
  season: string;
  week: number;
  /** Pin one side as "home" — usually the manager the receipt is *about*. */
  rosterId?: number;
  userId?: string;
  className?: string;
}

export async function MatchupReceipt({
  season,
  week,
  rosterId,
  userId,
  className,
}: MatchupReceiptProps) {
  const receipt = await getMatchupReceipt({
    season,
    week,
    ...(rosterId !== undefined ? { rosterId } : {}),
    ...(userId !== undefined ? { userId } : {}),
  });

  if (!receipt) {
    return (
      <div
        className={cn(
          "rounded-lg border border-border bg-surface px-3 py-2.5 text-[12px] text-foreground-subtle",
          className,
        )}
      >
        Matchup data not available for {season} wk {week}.
      </div>
    );
  }

  const { home, away, margin, season: s, week: w } = receipt;
  const isBye = home.manager.userId === away.manager.userId;

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-surface px-3 py-2.5",
        className,
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] uppercase tracking-[0.18em] text-foreground-subtle">
          {s} · Week {w}
        </span>
        {!isBye ? (
          <Pill
            tone={
              home.result === "W"
                ? "positive"
                : home.result === "L"
                  ? "negative"
                  : "neutral"
            }
            size="sm"
          >
            {home.result === "W" ? "Won" : home.result === "L" ? "Lost" : "Tie"}{" "}
            by {margin.toFixed(2)}
          </Pill>
        ) : (
          <Pill tone="neutral" size="sm">
            Bye / unmatched
          </Pill>
        )}
        <Link
          href={`/matchups/${s}/${w}`}
          className="ml-auto text-[11px] text-foreground-muted hover:text-accent transition-colors"
        >
          full week →
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Side side={home} highlight />
        {!isBye ? <Side side={away} /> : null}
      </div>
    </div>
  );
}

function Side({
  side,
  highlight = false,
}: {
  side: {
    manager: Manager;
    points: number;
    result: "W" | "L" | "T";
  };
  highlight?: boolean;
}) {
  return (
    <Link
      href={`/managers/${side.manager.username}`}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors",
        highlight
          ? "bg-foreground/[0.04] hover:bg-foreground/[0.07]"
          : "hover:bg-foreground/[0.03]",
      )}
    >
      <ManagerAvatar manager={side.manager} size={28} ring="subtle" />
      <span className="flex flex-col min-w-0 flex-1">
        <span className="text-[13px] text-foreground truncate">
          {side.manager.displayName}
        </span>
        <span className="text-[11px] text-foreground-subtle truncate">
          @{side.manager.username}
        </span>
      </span>
      <span
        className={cn(
          "tabular text-sm shrink-0",
          side.result === "W"
            ? "text-positive font-medium"
            : side.result === "L"
              ? "text-foreground-muted"
              : "text-foreground",
        )}
      >
        {side.points.toFixed(2)}
      </span>
    </Link>
  );
}
