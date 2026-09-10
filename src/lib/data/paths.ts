import path from "node:path";
import { cwd } from "node:process";

export const DATA_DIR = path.join(cwd(), "data");
export const LEAGUE_CACHE_DIR = path.join(DATA_DIR, "league-cache");
export const SNAPSHOT_DIR = path.join(DATA_DIR, "values-snapshots");
export const PLAYERS_PATH = path.join(DATA_DIR, "players.json");

export function seasonDir(season: string): string {
  return path.join(LEAGUE_CACHE_DIR, season);
}
