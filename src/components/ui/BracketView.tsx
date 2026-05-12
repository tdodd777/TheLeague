import Link from "next/link";

import { cn } from "@/lib/cn";
import type { SleeperBracketMatchup } from "@/lib/sleeper";
import type { Manager } from "@/lib/types";

import { ManagerAvatar } from "./ManagerAvatar";

interface BracketViewProps {
  matchups: SleeperBracketMatchup[];
  /** roster_id → manager. */
  managers: Map<number, Manager>;
  /** Optional title rendered above the rounds. */
  title?: React.ReactNode;
  /** Color hint applied to championship matchups (p === 1). */
  highlightChampionship?: boolean;
  /** When true, advancement badge says "loser" instead of "win". */
  losersBracket?: boolean;
  className?: string;
}

/**
 * Render a Sleeper bracket as columns of rounds, each round a column of
 * matchups. Resolves t1/t2 to managers (or "TBD" if not yet seeded) and
 * shows the winner with an accent.
 */
export function BracketView({
  matchups,
  managers,
  title,
  highlightChampionship = true,
  losersBracket = false,
  className,
}: BracketViewProps) {
  if (matchups.length === 0) return null;

  const rounds = new Map<number, SleeperBracketMatchup[]>();
  for (const m of matchups) {
    const arr = rounds.get(m.r) ?? [];
    arr.push(m);
    rounds.set(m.r, arr);
  }
  const orderedRounds = [...rounds.keys()].sort((a, b) => a - b);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {title !== undefined ? (
        <span className="text-[10px] uppercase tracking-[0.18em] text-foreground-subtle font-medium">
          {title}
        </span>
      ) : null}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {orderedRounds.map((round) => {
          const games = (rounds.get(round) ?? []).sort((a, b) => a.m - b.m);
          return (
            <div
              key={round}
              className="flex flex-col gap-2 min-w-[200px] sm:min-w-[220px]"
            >
              <span className="text-[10px] uppercase tracking-[0.18em] text-foreground-subtle">
                Round {round}
              </span>
              {games.map((m) => (
                <Game
                  key={m.m}
                  matchup={m}
                  managers={managers}
                  highlightChampionship={highlightChampionship}
                  losersBracket={losersBracket}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Game({
  matchup,
  managers,
  highlightChampionship,
  losersBracket,
}: {
  matchup: SleeperBracketMatchup;
  managers: Map<number, Manager>;
  highlightChampionship: boolean;
  losersBracket: boolean;
}) {
  const t1 = typeof matchup.t1 === "number" ? managers.get(matchup.t1) ?? null : null;
  const t2 = typeof matchup.t2 === "number" ? managers.get(matchup.t2) ?? null : null;
  const isChampionship = highlightChampionship && matchup.p === 1;
  const placeLabel =
    typeof matchup.p === "number" ? placementLabel(matchup.p) : null;

  return (
    <div
      className={cn(
        "rounded-lg border bg-surface px-3 py-2 flex flex-col gap-2",
        isChampionship
          ? "border-accent/40 ring-1 ring-inset ring-accent/30"
          : "border-border",
      )}
    >
      {placeLabel ? (
        <span
          className={cn(
            "text-[10px] uppercase tracking-[0.18em] font-medium",
            isChampionship ? "text-accent" : "text-foreground-subtle",
          )}
        >
          {placeLabel}
        </span>
      ) : null}
      <BracketRow
        manager={t1}
        rosterId={matchup.t1 ?? null}
        isWinner={
          typeof matchup.w === "number" && matchup.w === matchup.t1
        }
        decided={typeof matchup.w === "number"}
        from={matchup.t1_from ?? null}
        losersBracket={losersBracket}
      />
      <BracketRow
        manager={t2}
        rosterId={matchup.t2 ?? null}
        isWinner={
          typeof matchup.w === "number" && matchup.w === matchup.t2
        }
        decided={typeof matchup.w === "number"}
        from={matchup.t2_from ?? null}
        losersBracket={losersBracket}
      />
    </div>
  );
}

function BracketRow({
  manager,
  rosterId,
  isWinner,
  decided,
  from,
  losersBracket,
}: {
  manager: Manager | null;
  rosterId: number | null;
  isWinner: boolean;
  decided: boolean;
  from: { w?: number; l?: number } | null;
  losersBracket: boolean;
}) {
  const fromLabel = from
    ? from.w !== undefined
      ? `Winner of M${from.w}`
      : from.l !== undefined
        ? `Loser of M${from.l}`
        : null
    : null;

  if (!manager) {
    return (
      <div className="flex items-center gap-2 text-[11px] text-foreground-subtle h-7">
        <span className="inline-block h-5 w-5 rounded-full bg-foreground/[0.04]" />
        <span>{fromLabel ?? "TBD"}</span>
      </div>
    );
  }
  const accent = isWinner;
  const dim = decided && !isWinner;
  return (
    <Link
      href={`/managers/${manager.username}`}
      className={cn(
        "flex items-center gap-2 text-xs h-7 group",
        dim ? "opacity-50" : "",
      )}
      title={
        rosterId !== null
          ? `Roster ${rosterId} · ${manager.displayName}`
          : manager.displayName
      }
    >
      <ManagerAvatar manager={manager} size={20} ring="subtle" />
      <span
        className={cn(
          "truncate flex-1 transition-colors",
          accent
            ? "text-foreground font-medium"
            : "text-foreground-muted group-hover:text-foreground",
        )}
      >
        @{manager.username}
      </span>
      {accent ? (
        <span className="text-[10px] uppercase tracking-[0.18em] text-accent">
          {losersBracket ? "loser" : "win"}
        </span>
      ) : null}
    </Link>
  );
}

function placementLabel(p: number): string {
  if (p === 1) return "Championship";
  if (p === 3) return "3rd-place";
  if (p === 5) return "5th-place";
  if (p === 7) return "7th-place";
  if (p === 9) return "9th-place";
  if (p === 11) return "11th-place";
  return `Place #${p}`;
}
