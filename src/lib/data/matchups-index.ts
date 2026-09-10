import { readdir } from "node:fs/promises";

import { listCachedSeasons, readMatchups } from "./cache";
import { seasonDir } from "./paths";

export interface SeasonWeeks {
  season: string;
  weeks: number[];
}

/**
 * For each cached season, returns the sorted list of weeks that have been
 * played: a `matchups-NN.json` file on disk that `readMatchups` accepts (at
 * least one scheduled roster with points). Sleeper's 0-point schedule stubs
 * and ghost weeks with no pairings are excluded, so `generateStaticParams`,
 * the week nav, the command palette, and the `/matchups` redirect never land
 * on an empty scoreboard.
 */
export async function listCachedMatchupWeeks(): Promise<SeasonWeeks[]> {
  const seasons = await listCachedSeasons();
  const out: SeasonWeeks[] = [];
  for (const season of seasons) {
    const entries = await readdir(seasonDir(season));
    const candidates = entries
      .map((f) => /^matchups-(\d{2})\.json$/.exec(f))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => Number.parseInt(m[1]!, 10))
      .sort((a, b) => a - b);
    const weeks: number[] = [];
    for (const week of candidates) {
      if ((await readMatchups(season, week)) !== null) weeks.push(week);
    }
    out.push({ season, weeks });
  }
  return out;
}

/**
 * Most recent (season, week) that has been played, or null if none exist.
 * Seasons are newest-first, so in-season the current week wins as soon as
 * anyone scores.
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
