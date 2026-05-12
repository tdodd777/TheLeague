"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { SleeperMatchup } from "@/lib/sleeper";

import type { LiveManagerLite } from "./LiveScoreboard";
import { useLiveMatchups } from "./useLiveMatchups";

interface Props {
  leagueId: string;
  managers: LiveManagerLite[];
}

interface Pair {
  a: SleeperMatchup;
  b: SleeperMatchup;
}

function closestGame(list: SleeperMatchup[]): Pair | null {
  const byId = new Map<number, SleeperMatchup[]>();
  for (const m of list) {
    const arr = byId.get(m.matchup_id) ?? [];
    arr.push(m);
    byId.set(m.matchup_id, arr);
  }
  let best: Pair | null = null;
  let bestMargin = Infinity;
  for (const arr of byId.values()) {
    if (arr.length !== 2) continue;
    const [a, b] = arr as [SleeperMatchup, SleeperMatchup];
    const margin = Math.abs(a.points - b.points);
    if (margin < bestMargin) {
      bestMargin = margin;
      best = { a, b };
    }
  }
  return best;
}

export function LiveBanner({ leagueId, managers }: Props) {
  const path = usePathname();
  const { mode, matchups } = useLiveMatchups({ leagueId });

  if (mode.phase !== "active" || !matchups) return null;
  if (path === "/" || path.startsWith("/matchups")) return null;
  if (/^\/managers\/[^/]+$/.test(path)) return null;

  const pair = closestGame(matchups);
  if (!pair) return null;

  const byRoster = new Map<number, LiveManagerLite>();
  for (const m of managers) byRoster.set(m.rosterId, m);
  const am = byRoster.get(pair.a.roster_id);
  const bm = byRoster.get(pair.b.roster_id);
  if (!am || !bm) return null;

  return (
    <Link
      href="/matchups"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 inline-flex items-center gap-3 rounded-full border border-border bg-surface-elevated/95 backdrop-blur-md px-4 py-2 text-xs shadow-lg hover:border-border-strong transition-colors"
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-positive opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-positive" />
      </span>
      <span className="text-foreground-muted">Closest game</span>
      <span className="tabular text-foreground">
        {am.displayName} {pair.a.points.toFixed(1)} – {pair.b.points.toFixed(1)} {bm.displayName}
      </span>
    </Link>
  );
}
