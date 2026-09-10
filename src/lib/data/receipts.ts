import { readMatchups } from "./cache";
import { getManagers } from "./managers";
import type { Manager } from "@/lib/types";

export interface MatchupReceipt {
  season: string;
  week: number;
  matchupId: number;
  home: { manager: Manager; points: number; result: "W" | "L" | "T" };
  away: { manager: Manager; points: number; result: "W" | "L" | "T" };
  margin: number;
}

/**
 * Resolve the matchup that a (season, week, rosterId) belongs to and return
 * a normalised pair of sides. The "home" side is the queried manager when
 * `rosterId` is provided; otherwise the higher-scoring side.
 */
export async function getMatchupReceipt(args: {
  season: string;
  week: number;
  rosterId?: number;
  userId?: string;
}): Promise<MatchupReceipt | null> {
  const { season, week, rosterId, userId } = args;
  const matchups = await readMatchups(season, week);
  if (!matchups || matchups.length === 0) return null;

  const lookup = await getManagers(season);

  let resolvedRosterId = rosterId;
  if (resolvedRosterId === undefined && userId) {
    const m = lookup.byUserId.get(userId);
    if (m) resolvedRosterId = m.rosterId;
  }

  const matchupId =
    resolvedRosterId !== undefined
      ? matchups.find((m) => m.roster_id === resolvedRosterId)?.matchup_id
      : matchups[0]?.matchup_id;
  if (matchupId === undefined || matchupId === null) return null;

  const sides = matchups.filter((m) => m.matchup_id === matchupId);
  if (sides.length === 0) return null;

  // Pick orientation: queried roster as "home"; else higher scorer.
  const sortedByPoints = [...sides].sort((a, b) => b.points - a.points);
  const home =
    resolvedRosterId !== undefined
      ? sides.find((s) => s.roster_id === resolvedRosterId) ?? sortedByPoints[0]
      : sortedByPoints[0];
  if (!home) return null;
  const away = sides.find((s) => s.roster_id !== home.roster_id);
  // Bye/solo: render as a single-side receipt.
  const homeManager = lookup.byRosterId.get(home.roster_id);
  if (!homeManager) return null;

  if (!away) {
    return {
      season,
      week,
      matchupId,
      home: { manager: homeManager, points: home.points, result: "T" },
      away: { manager: homeManager, points: 0, result: "T" },
      margin: 0,
    };
  }

  const awayManager = lookup.byRosterId.get(away.roster_id);
  if (!awayManager) return null;

  const margin = Math.abs(home.points - away.points);
  let homeResult: "W" | "L" | "T" = "T";
  let awayResult: "W" | "L" | "T" = "T";
  if (home.points > away.points) {
    homeResult = "W";
    awayResult = "L";
  } else if (home.points < away.points) {
    homeResult = "L";
    awayResult = "W";
  }

  return {
    season,
    week,
    matchupId,
    home: { manager: homeManager, points: home.points, result: homeResult },
    away: { manager: awayManager, points: away.points, result: awayResult },
    margin,
  };
}
