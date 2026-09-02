import type { SleeperMatchup } from "./types";

/**
 * Once a league flips to `in_season`, Sleeper publishes the full regular-season
 * schedule up front: `/league/{id}/matchups/{week}` returns a pair per matchup
 * for every future week, with `points: 0` on both sides. Those entries are
 * schedule stubs, not results. Anything that treats "matchups exist" as
 * "the week was played" (scoreboards, sparklines, all-play records, the
 * latest-week redirect) needs to filter them out.
 */
export function hasScore(matchup: SleeperMatchup): boolean {
  return Number.isFinite(matchup.points) && matchup.points > 0;
}

/**
 * True when at least one roster has put points on the board this week —
 * i.e. the week is in progress or complete, rather than a future schedule stub.
 */
export function isPlayedWeek(matchups: ReadonlyArray<SleeperMatchup> | null | undefined): boolean {
  if (!matchups || matchups.length === 0) return false;
  return matchups.some(hasScore);
}
