import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import type {
  SleeperDraft,
  SleeperLeague,
  SleeperMatchup,
  SleeperPlayer,
  SleeperRoster,
  SleeperTradedPick,
  SleeperTransaction,
  SleeperUser,
} from "@/lib/sleeper";

import { LEAGUE_CACHE_DIR, PLAYERS_PATH, seasonDir } from "./paths";

async function readJson<T>(file: string): Promise<T> {
  const raw = await readFile(file, "utf8");
  return JSON.parse(raw) as T;
}

async function readJsonOrNull<T>(file: string): Promise<T | null> {
  try {
    return await readJson<T>(file);
  } catch (err) {
    if (
      err instanceof Error &&
      "code" in err &&
      (err as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return null;
    }
    throw err;
  }
}

export async function listCachedSeasons(): Promise<string[]> {
  const entries = await readdir(LEAGUE_CACHE_DIR, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .reverse();
}

export async function readLeague(season: string): Promise<SleeperLeague> {
  return readJson<SleeperLeague>(path.join(seasonDir(season), "league.json"));
}

export async function readUsers(season: string): Promise<SleeperUser[]> {
  return readJson<SleeperUser[]>(path.join(seasonDir(season), "users.json"));
}

export async function readRosters(season: string): Promise<SleeperRoster[]> {
  return readJson<SleeperRoster[]>(
    path.join(seasonDir(season), "rosters.json"),
  );
}

export async function readTradedPicks(
  season: string,
): Promise<SleeperTradedPick[]> {
  return readJson<SleeperTradedPick[]>(
    path.join(seasonDir(season), "traded_picks.json"),
  );
}

export async function readDrafts(season: string): Promise<SleeperDraft[]> {
  return readJson<SleeperDraft[]>(path.join(seasonDir(season), "drafts.json"));
}

export async function readMatchups(
  season: string,
  week: number,
): Promise<SleeperMatchup[] | null> {
  const file = path.join(
    seasonDir(season),
    `matchups-${String(week).padStart(2, "0")}.json`,
  );
  return readJsonOrNull<SleeperMatchup[]>(file);
}

/** Per-player projected points for a given (season, week). Map keys are sleeper player_ids. */
export async function readProjections(
  season: string,
  week: number,
): Promise<Record<string, number> | null> {
  const file = path.join(
    seasonDir(season),
    `projections-${String(week).padStart(2, "0")}.json`,
  );
  return readJsonOrNull<Record<string, number>>(file);
}

export async function readTransactions(
  season: string,
  week: number,
): Promise<SleeperTransaction[] | null> {
  const file = path.join(
    seasonDir(season),
    `transactions-${String(week).padStart(2, "0")}.json`,
  );
  return readJsonOrNull<SleeperTransaction[]>(file);
}

export async function readAllTransactions(
  season: string,
): Promise<SleeperTransaction[]> {
  const dir = seasonDir(season);
  const entries = await readdir(dir);
  const files = entries.filter((f) => f.startsWith("transactions-"));
  const all: SleeperTransaction[] = [];
  for (const file of files) {
    const list = await readJson<SleeperTransaction[]>(path.join(dir, file));
    all.push(...list);
  }
  all.sort((a, b) => b.status_updated - a.status_updated);
  return all;
}

let playersCache: Record<string, SleeperPlayer> | null = null;

export async function readPlayers(): Promise<Record<string, SleeperPlayer>> {
  if (playersCache) return playersCache;
  const data = await readJson<Record<string, SleeperPlayer>>(PLAYERS_PATH);
  playersCache = data;
  return data;
}
