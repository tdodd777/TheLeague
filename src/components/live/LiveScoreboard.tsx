"use client";

import Image from "next/image";
import Link from "next/link";

import { Kicker, Pill } from "@/components/ui";
import type { SleeperMatchup } from "@/lib/sleeper";

import { useLiveMatchups } from "./useLiveMatchups";

export interface LiveManagerLite {
  rosterId: number;
  username: string;
  displayName: string;
  avatarUrl: string;
}

interface Props {
  leagueId: string;
  managers: LiveManagerLite[];
  fallback: React.ReactNode;
}

interface MatchupPair {
  matchupId: number;
  a: SleeperMatchup;
  b: SleeperMatchup;
}

function groupMatchups(list: SleeperMatchup[]): MatchupPair[] {
  const byId = new Map<number, SleeperMatchup[]>();
  for (const m of list) {
    const arr = byId.get(m.matchup_id) ?? [];
    arr.push(m);
    byId.set(m.matchup_id, arr);
  }
  const pairs: MatchupPair[] = [];
  for (const [matchupId, arr] of byId) {
    if (arr.length !== 2) continue;
    const [a, b] = arr as [SleeperMatchup, SleeperMatchup];
    pairs.push({ matchupId, a, b });
  }
  return pairs.sort((p, q) => {
    const margin = (x: MatchupPair): number => Math.abs(x.a.points - x.b.points);
    return margin(p) - margin(q);
  });
}

function winProb(a: number, b: number): number {
  // Simple proxy: logistic on point margin scaled to typical fantasy weekly variance.
  const margin = a - b;
  const s = 1 / (1 + Math.exp(-margin / 12));
  return Math.round(s * 100);
}

export function LiveScoreboard({ leagueId, managers, fallback }: Props) {
  const { mode, matchups, lastUpdated, error } = useLiveMatchups({ leagueId });

  if (mode.phase !== "active" || !matchups) {
    return <>{fallback}</>;
  }

  const byRoster = new Map<number, LiveManagerLite>();
  for (const m of managers) byRoster.set(m.rosterId, m);

  const pairs = groupMatchups(matchups);

  return (
    <section className="relative overflow-hidden border-b border-border">
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 pt-12 pb-12 sm:pt-16 sm:pb-16 flex flex-col gap-6">
        <div className="flex items-baseline justify-between gap-3">
          <Kicker>
            <span className="inline-flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-positive opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-positive" />
              </span>
              Live · Week {mode.week}
            </span>
          </Kicker>
          <span className="text-xs text-foreground-subtle tabular">
            {lastUpdated
              ? `updated ${new Date(lastUpdated).toLocaleTimeString([], {
                  hour: "numeric",
                  minute: "2-digit",
                })}`
              : "loading…"}
          </span>
        </div>

        <h1 className="font-display text-foreground text-[2.5rem] sm:text-[4rem] leading-[0.95] tracking-tight">
          Game Day
        </h1>

        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {pairs.map(({ matchupId, a, b }) => {
            const am = byRoster.get(a.roster_id);
            const bm = byRoster.get(b.roster_id);
            if (!am || !bm) return null;
            const probA = winProb(a.points, b.points);
            return (
              <li
                key={matchupId}
                className="rounded-xl border border-border bg-surface px-4 py-3 flex flex-col gap-2"
              >
                <Row m={am} pts={a.points} prob={probA} leading={a.points >= b.points} />
                <Row m={bm} pts={b.points} prob={100 - probA} leading={b.points > a.points} />
              </li>
            );
          })}
        </ul>

        {error ? (
          <p className="text-xs text-foreground-subtle">
            Live polling hiccup: {error}. Will retry shortly.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function Row({
  m,
  pts,
  prob,
  leading,
}: {
  m: LiveManagerLite;
  pts: number;
  prob: number;
  leading: boolean;
}) {
  return (
    <Link
      href={`/managers/${m.username}`}
      className="flex items-center gap-3 group"
    >
      <span className="block h-7 w-7 overflow-hidden rounded-full bg-foreground/5 shrink-0">
        <Image
          src={m.avatarUrl}
          alt={m.displayName}
          width={28}
          height={28}
          sizes="28px"
          className="h-full w-full object-cover"
        />
      </span>
      <span className="flex-1 truncate text-sm text-foreground group-hover:text-accent transition-colors">
        {m.displayName}
      </span>
      <span
        className={`tabular text-sm ${leading ? "text-foreground" : "text-foreground-muted"}`}
      >
        {pts.toFixed(1)}
      </span>
      <Pill tone={leading ? "positive" : "neutral"} size="sm">
        {prob}%
      </Pill>
    </Link>
  );
}
