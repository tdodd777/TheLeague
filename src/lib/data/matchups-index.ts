import { readdir } from "node:fs/promises";

import { listCachedSeasons } from "./cache";
import { seasonDir } from "./paths";

export interface SeasonWeeks {
  season: string;
  weeks: number[];
}

/**
 * For each cached season, returns the sorted list of weeks that have a
 * `matchups-NN.json` file on disk. Drives `generateStaticParams` for the
 * matchups routes.
 */
export async function listCachedMatchupWeeks(): Promise<SeasonWeeks[]> {
  const seasons = await listCachedSeasons();
  const out: SeasonWeeks[] = [];
  for (const season of seasons) {
    const entries = await readdir(seasonDir(season));
    const weeks = entries
      .map((f) => /^matchups-(\d{2})\.json$/.exec(f))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => Number.parseInt(m[1]!, 10))
      .sort((a, b) => a - b);
    out.push({ season, weeks });
  }
  return out;
}

/**
 * Most recent (season, week) with cached matchup data, or null if none exist.
 * Walks seasons newest-first; within a season, picks the highest week.
 */
export async function latestCachedMatchupWeek(): Promise<{
  season: string;
  week: number;
} | null> {
  const all = await listCachedMatchupWeeks();
  for (const { season, weeks } of all) {
    const last = weeks[weeks.length - 1];
    if (last !== undefined) return { season, week: last };
  }
  return null;
}
