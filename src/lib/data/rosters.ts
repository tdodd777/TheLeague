import type { SeasonRoster } from "@/lib/types";

import { readLeague, readRosters } from "./cache";
import { getManagers } from "./managers";

const EMPTY_SLOT = "0";

export async function getRosters(season: string): Promise<SeasonRoster[]> {
  const [league, rosters, managers] = await Promise.all([
    readLeague(season),
    readRosters(season),
    getManagers(season),
  ]);

  const result: SeasonRoster[] = [];
  for (const r of rosters) {
    const manager = managers.byRosterId.get(r.roster_id);
    if (!manager) continue;
    const starters = (r.starters ?? []).filter((id) => id !== EMPTY_SLOT);
    const reserve = r.reserve ?? [];
    const taxi = r.taxi ?? [];
    const allPlayers = r.players ?? [];
    const reservedSet = new Set([...starters, ...reserve, ...taxi]);
    const bench = allPlayers.filter((id) => !reservedSet.has(id));
    result.push({
      season: league.season,
      leagueId: league.league_id,
      manager,
      starters,
      bench,
      reserve,
      taxi,
      allPlayers,
    });
  }

  result.sort((a, b) => a.manager.rosterId - b.manager.rosterId);
  return result;
}

export async function getRosterByUserId(
  season: string,
  userId: string,
): Promise<SeasonRoster | null> {
  const all = await getRosters(season);
  return all.find((r) => r.manager.userId === userId) ?? null;
}
