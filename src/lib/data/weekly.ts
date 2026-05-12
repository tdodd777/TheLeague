import { readMatchups } from "./cache";

/**
 * Returns a map of rosterId -> per-week points for the given season.
 * Only weeks that have stored matchup data are included.
 */
export async function getWeeklyPointsByRoster(
  season: string,
  maxWeek = 18,
): Promise<Map<number, number[]>> {
  const result = new Map<number, number[]>();
  for (let week = 1; week <= maxWeek; week += 1) {
    const matchups = await readMatchups(season, week);
    if (!matchups) continue;
    for (const m of matchups) {
      const arr = result.get(m.roster_id) ?? [];
      arr.push(m.points);
      result.set(m.roster_id, arr);
    }
  }
  return result;
}
