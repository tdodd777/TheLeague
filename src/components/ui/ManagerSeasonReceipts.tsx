import Link from "next/link";

import { getMatchupReceipt } from "@/lib/data/receipts";
import { getManagers } from "@/lib/data/managers";
import { readMatchups } from "@/lib/data/cache";
import { cn } from "@/lib/cn";

interface ManagerSeasonReceiptsProps {
  season: string;
  userId: string;
  /** Max regular season + playoff weeks to scan. Default 18. */
  maxWeek?: number;
  className?: string;
}

export async function ManagerSeasonReceipts({
  season,
  userId,
  maxWeek = 18,
  className,
}: ManagerSeasonReceiptsProps) {
  const lookup = await getManagers(season);
  const me = lookup.byUserId.get(userId);
  if (!me) {
    return (
      <div className={cn("text-[12px] text-foreground-subtle", className)}>
        No roster on file for this manager in {season}.
      </div>
    );
  }

  const rows: Array<{
    week: number;
    me: number;
    opp: number;
    oppUsername: string | null;
    result: "W" | "L" | "T";
  }> = [];

  for (let week = 1; week <= maxWeek; week += 1) {
    const ms = await readMatchups(season, week);
    if (!ms) continue;
    const mine = ms.find((m) => m.roster_id === me.rosterId);
    if (!mine) continue;
    const receipt = await getMatchupReceipt({
      season,
      week,
      rosterId: me.rosterId,
    });
    if (!receipt) continue;
    rows.push({
      week,
      me: receipt.home.points,
      opp: receipt.away.points,
      oppUsername:
        receipt.home.manager.userId === receipt.away.manager.userId
          ? null
          : receipt.away.manager.username,
      result: receipt.home.result,
    });
  }

  if (rows.length === 0) {
    return (
      <div className={cn("text-[12px] text-foreground-subtle", className)}>
        No matchup data cached for {season}.
      </div>
    );
  }

  const wins = rows.filter((r) => r.result === "W").length;
  const losses = rows.filter((r) => r.result === "L").length;
  const ties = rows.filter((r) => r.result === "T").length;

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-surface px-3 py-2.5",
        className,
      )}
    >
      <div className="flex items-center gap-2 mb-2 text-[10px] uppercase tracking-[0.18em] text-foreground-subtle">
        <span>{season} weekly receipts</span>
        <span className="ml-auto tabular text-foreground-muted">
          {wins}-{losses}
          {ties ? `-${ties}` : ""}
        </span>
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
        {rows.map((r) => (
          <li
            key={r.week}
            className="flex items-center gap-2 py-1 text-[12px] border-b border-border/40 last:border-b-0"
          >
            <span className="tabular text-foreground-subtle w-7 shrink-0">
              wk {r.week}
            </span>
            <span
              className={cn(
                "w-4 text-center text-[10px] font-semibold tabular shrink-0",
                r.result === "W"
                  ? "text-positive"
                  : r.result === "L"
                    ? "text-negative"
                    : "text-foreground-muted",
              )}
            >
              {r.result}
            </span>
            <span className="flex-1 min-w-0 truncate text-foreground-muted">
              {r.oppUsername ? (
                <>
                  vs{" "}
                  <Link
                    href={`/managers/${r.oppUsername}`}
                    className="text-foreground hover:text-accent transition-colors"
                  >
                    @{r.oppUsername}
                  </Link>
                </>
              ) : (
                <span className="text-foreground-subtle">bye</span>
              )}
            </span>
            <span className="tabular text-foreground shrink-0">
              {r.me.toFixed(2)}
              <span className="text-foreground-subtle"> – </span>
              {r.opp.toFixed(2)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
