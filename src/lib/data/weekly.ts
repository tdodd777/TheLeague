import { readCompletedThroughWeek, readLeague, readMatchups } from "./cache";

/** Sleeper never stores a league week past 18, playoffs included. */
export const MAX_MATCHUP_WEEK = 18;

/** Used only when a league has no `playoff_week_start` on record. */
const FALLBACK_PLAYOFF_WEEK_START = 15;

/**
 * Which weeks a per-week calculation is allowed to count.
 *
 * - `regular` — weeks 1 through `playoff_week_start - 1`. This is the only
 *   scope that lines up with a roster's `settings.fpts`, `wins`, and `losses`,
 *   because Sleeper stops accumulating those the moment the playoffs start.
 *   Anything divided by games played, compared against a W-L record, or
 *   described as recent form has to use this scope or the two halves of the
 *   ratio describe different seasons.
 * - `all` — every week that has stored matchups, playoff and consolation weeks
 *   included. For record-book questions ("highest week anyone has ever put up")
 *   where a week 16 explosion still deserves to count.
 *
 * There is deliberately no default. Picking the wrong one is silent and wrong,
 * so every caller states which season it means.
 */
export type WeekScope = "regular" | "all";

export interface WeekBounds {
  scope: WeekScope;
  /** Last week this scope counts, inclusive. Weeks 1..lastWeek are in play. */
  lastWeek: number;
  /** Final regular-season week, from `playoff_week_start - 1`. */
  regularSeasonEndWeek: number;
  /**
   * Highest week whose games are final, per the season manifest. `null` means
   * the season has no manifest, i.e. unknown — not "nothing is complete".
   */
  completedThroughWeek: number | null;
}

/**
 * Final regular-season week for a season, derived from league settings rather
 * than assumed. A 14-week regular season reports 14.
 */
export async function getRegularSeasonEndWeek(season: string): Promise<number> {
  const league = await readLeague(season);
  const start = league.settings.playoff_week_start;
  const playoffStart =
    typeof start === "number" && start > 1 ? start : FALLBACK_PLAYOFF_WEEK_START;
  return playoffStart - 1;
}

/**
 * Week range for a season under a given scope. Also clamps to the last week
 * that is actually finished, so a Sunday afternoon in progress never counts as
 * a played game. When the season has no manifest the clamp is skipped, since
 * unknown is not the same as zero.
 */
export async function getWeekBounds(
  season: string,
  scope: WeekScope,
): Promise<WeekBounds> {
  const [regularSeasonEndWeek, completedThroughWeek] = await Promise.all([
    getRegularSeasonEndWeek(season),
    readCompletedThroughWeek(season),
  ]);
  // `completedThroughWeek` is defined as bounded by the regular season, so it
  // is 14 for every finished season here. Clamping the `all` scope with it
  // would cap that scope at 14 too, silently deleting every playoff week from
  // the record book the moment an ingest run commits a manifest. It must only
  // ever narrow the regular-season ceiling.
  //
  // Playoff weeks are bounded instead by the data itself: `readMatchups`
  // returns null for a week that was never stored, and callers drop rows with
  // no `matchup_id` (a bye or a ghost week where the league played nothing).
  const regularEnd =
    completedThroughWeek === null
      ? regularSeasonEndWeek
      : Math.min(regularSeasonEndWeek, completedThroughWeek);
  // While the regular season is still running, no playoff week exists yet, so
  // `all` is bounded by the same watermark. Once the regular season is done the
  // watermark stops moving (it only ever tracks the regular season), and the
  // playoff ceiling has to come from the stored data instead.
  const allEnd =
    regularEnd < regularSeasonEndWeek ? regularEnd : MAX_MATCHUP_WEEK;
  const lastWeek = scope === "regular" ? regularEnd : allEnd;
  return {
    scope,
    lastWeek: Math.max(0, lastWeek),
    regularSeasonEndWeek,
    completedThroughWeek,
  };
}

export interface WeeklyPointsOptions {
  /**
   * Required. `regular` for anything compared against records, points for, or
   * form; `all` for record-book totals that should include the playoffs.
   */
  scope: WeekScope;
}

/**
 * Returns a map of rosterId -> per-week points for the given season, in week
 * order. Only weeks inside the requested scope that have stored matchup data
 * are included.
 */
export async function getWeeklyPointsByRoster(
  season: string,
  options: WeeklyPointsOptions,
): Promise<Map<number, number[]>> {
  const { lastWeek } = await getWeekBounds(season, options.scope);
  const result = new Map<number, number[]>();
  for (let week = 1; week <= lastWeek; week += 1) {
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
