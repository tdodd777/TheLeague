import { sleeper } from "./client";
import type { SleeperLeague } from "./types";

export interface LeagueChainEntry {
  season: string;
  league: SleeperLeague;
}

const MAX_DEPTH = 25;

export async function walkLeagueChain(
  rootLeagueId: string,
): Promise<LeagueChainEntry[]> {
  const chain: LeagueChainEntry[] = [];
  const seen = new Set<string>();
  let currentId: string | null = rootLeagueId;
  let depth = 0;

  while (currentId && depth < MAX_DEPTH) {
    if (seen.has(currentId)) break;
    seen.add(currentId);
    const league: SleeperLeague = await sleeper.league(currentId);
    chain.push({ season: league.season, league });
    currentId = league.previous_league_id;
    depth += 1;
  }

  return chain;
}
