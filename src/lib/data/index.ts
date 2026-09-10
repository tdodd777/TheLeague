export * from "./cache";
export * from "./managers";
export * from "./standings";
export * from "./rosters";
export * from "./career";
export * from "./weekly";
export * from "./h2h";
export * from "./lineup";
export * from "./brackets";
export * from "./records";
export * from "./trades";
export * from "./transactions";
export * from "./trade-stats";
export * from "./drafts";
export * from "./picks";
export * from "./matchups-index";
export { DATA_DIR, LEAGUE_CACHE_DIR, PLAYERS_PATH, SNAPSHOT_DIR } from "./paths";

import { listCachedSeasons, readLeague } from "./cache";
import type { SleeperLeague } from "@/lib/sleeper";

/**
 * Returns the most recent season's league. Falls back to the most recent
 * cached season if the current is missing.
 */
export async function getCurrentLeague(): Promise<{
  season: string;
  league: SleeperLeague;
}> {
  const seasons = await listCachedSeasons();
  const head = seasons[0];
  if (!head) throw new Error("No cached seasons. Run `npm run ingest`.");
  const league = await readLeague(head);
  return { season: head, league };
}
