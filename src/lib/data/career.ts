import type { ManagerCareerStats, Manager } from "@/lib/types";

import { listCachedSeasons } from "./cache";
import { getStandings } from "./standings";

export async function getManagerCareer(
  userId: string,
): Promise<ManagerCareerStats | null> {
  const seasons = await listCachedSeasons();
  let manager: Manager | null = null;
  const seasonRows: ManagerCareerStats["seasons"] = [];
  let totals = { wins: 0, losses: 0, ties: 0, pf: 0, pa: 0, ppts: 0 };

  for (const season of seasons) {
    const standings = await getStandings(season);
    const found = standings.find((s) => s.manager.userId === userId);
    if (!found) continue;
    if (!manager) manager = found.manager;

    const finishRank = found.wins + found.losses + found.ties === 0
      ? null
      : standings.indexOf(found) + 1;

    seasonRows.push({
      season,
      wins: found.wins,
      losses: found.losses,
      ties: found.ties,
      pf: found.pf,
      pa: found.pa,
      ppts: found.ppts,
      finishRank,
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
