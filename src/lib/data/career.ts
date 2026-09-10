import type { ManagerCareerStats, Manager } from "@/lib/types";

import { getSeasonPlacements } from "./brackets";
import { listCachedSeasons } from "./cache";
import { getStandings } from "./standings";

/**
 * One season of a manager's career.
 *
 * `finishRank` and `seedRank` are two different numbers and are kept apart on
 * purpose. In 2024 the regular season's best record belonged to roster 12
 * (seed 1) but roster 5 won the title from seed 4. Collapsing the two hands out
 * rings nobody won.
 */
export interface CareerSeasonRow {
  season: string;
  wins: number;
  losses: number;
  ties: number;
  pf: number;
  pa: number;
  /** Potential points (Sleeper's ppts) for the season — best-possible lineup output. */
  ppts: number;
  /**
   * True final placement from the playoff bracket: 1 is the champion. `null`
   * when the season has no games yet or the bracket has not been played.
   */
  finishRank: number | null;
  /**
   * Regular-season standings position, i.e. the playoff seed. `null` before the
   * season has any games on the books.
   */
  seedRank: number | null;
}

/**
 * `ManagerCareerStats` with the richer per-season row. Structurally still a
 * `ManagerCareerStats`, so existing consumers keep compiling.
 */
export interface ManagerCareer extends Omit<ManagerCareerStats, "seasons"> {
  seasons: CareerSeasonRow[];
}

export async function getManagerCareer(
  userId: string,
): Promise<ManagerCareer | null> {
  const seasons = await listCachedSeasons();
  let manager: Manager | null = null;
  const seasonRows: CareerSeasonRow[] = [];
  let totals = { wins: 0, losses: 0, ties: 0, pf: 0, pa: 0, ppts: 0 };

  for (const season of seasons) {
    const standings = await getStandings(season);
    const found = standings.find((s) => s.manager.userId === userId);
    if (!found) continue;
    if (!manager) manager = found.manager;

    const played = found.wins + found.losses + found.ties > 0;
    const seedRank = played ? standings.indexOf(found) + 1 : null;

    // Finish comes from the bracket, never from standings order. A season with
    // no bracket on file (in progress, or Sleeper had nothing) reports null
    // rather than quietly falling back to the seed.
    let finishRank: number | null = null;
    if (played) {
      const placements = await getSeasonPlacements(season).catch(() => null);
      finishRank = placements?.byRosterId.get(found.rosterId) ?? null;
    }

    seasonRows.push({
      season,
      wins: found.wins,
      losses: found.losses,
      ties: found.ties,
      pf: found.pf,
      pa: found.pa,
      ppts: found.ppts,
      finishRank,
      seedRank,
    });

    totals = {
      wins: totals.wins + found.wins,
      losses: totals.losses + found.losses,
      ties: totals.ties + found.ties,
      pf: totals.pf + found.pf,
      pa: totals.pa + found.pa,
      ppts: totals.ppts + found.ppts,
    };
  }

  if (!manager) return null;

  return {
    manager,
    seasons: seasonRows,
    totals,
  };
}
