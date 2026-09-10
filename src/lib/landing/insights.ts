import {
  type FeedTransaction,
  getSeasonPlacements,
  getStandings,
  getTransactionsFeed,
  getWeeklyPointsByRoster,
  latestCachedMatchupWeek,
  listCachedSeasons,
  readDrafts,
} from "@/lib/data";
import {
  buildDynastyRankings,
} from "@/lib/rankings/engine";
import type {
  ValuedAsset,
} from "@/lib/rankings/types";
import type { SleeperDraft, SleeperLeague } from "@/lib/sleeper/types";
import type { SeasonStanding } from "@/lib/types";

export type Lede =
  | {
      kind: "champion";
      /** Winner of the playoff bracket, not the best regular-season record. */
      champ: SeasonStanding;
      /** Regular-season seed the champion won it from. Null if not resolvable. */
      champSeed: number | null;
      /** Regular-season weekly points, matching the record and PF beside it. */
      weekly: number[];
      topMover: ValuedAsset | null;
      lastSeason: string;
    }
  | { kind: "draft"; draft: SleeperDraft }
  | {
      kind: "crowned";
      /** Winner of the playoff bracket, not the best regular-season record. */
      champ: SeasonStanding;
      /** Loser of the championship game. */
      runnerUp: SeasonStanding | null;
      /** Regular-season seed the champion won it from. Null if not resolvable. */
      champSeed: number | null;
      season: string;
    };

export interface LandingInsights {
  phaseLine: string;
  lede: Lede | null;
  activity: FeedTransaction[];
}

const ACTIVITY_LIMIT = 7;

function daysBetween(fromMs: number, toMs: number): number {
  return Math.ceil((toMs - fromMs) / (1000 * 60 * 60 * 24));
}

function pluralWeeks(n: number): string {
  return `${n} week${n === 1 ? "" : "s"}`;
}

function pluralDays(n: number): string {
  return `${n} day${n === 1 ? "" : "s"}`;
}

interface SeasonPodium {
  champ: SeasonStanding | null;
  runnerUp: SeasonStanding | null;
  /** Regular-season standings position the champion came from. */
  champSeed: number | null;
}

/**
 * Champion and runner-up for a season, read from the playoff bracket.
 *
 * Standings order is a seed, not a finish. In 2024 the best regular-season
 * record (roster 12, 11-3) lost the title to roster 5 (10-4), so crowning
 * `standings[0]` hands the ring to the wrong manager. When the bracket is
 * missing this returns nulls rather than falling back to the seed, because a
 * missing champion is honest and a wrong one is not.
 */
async function resolveSeasonPodium(season: string): Promise<SeasonPodium> {
  const standings = await getStandings(season);
  const placements = await getSeasonPlacements(season).catch(() => null);
  if (!placements) return { champ: null, runnerUp: null, champSeed: null };

  const rowFor = (rosterId: number | null): SeasonStanding | null =>
    rosterId === null
      ? null
      : (standings.find((s) => s.rosterId === rosterId) ?? null);

  const champ = rowFor(placements.champion);
  const runnerUp = rowFor(placements.runnerUp);
  const champSeed = champ === null ? null : standings.indexOf(champ) + 1;
  return { champ, runnerUp, champSeed };
}

export async function getLandingInsights(
  season: string,
  league: SleeperLeague,
): Promise<LandingInsights> {
  const seasons = await listCachedSeasons();
  // Most recent prior season, used for off-season storylines.
  const lastCompleted = seasons.find((s) => s !== season) ?? null;

  const [phaseLine, lede, feed] = await Promise.all([
    buildPhaseLine(season, league),
    buildLede(season, league, lastCompleted),
    getTransactionsFeed(),
  ]);

  return {
    phaseLine,
    lede,
    activity: feed.slice(0, ACTIVITY_LIMIT),
  };
}

async function buildPhaseLine(
  season: string,
  league: SleeperLeague,
): Promise<string> {
  switch (league.status) {
    case "pre_draft": {
      const drafts = await readDrafts(season).catch(() => []);
      const startMs = drafts[0]?.start_time ?? null;
      if (startMs && startMs > Date.now()) {
        return `Pre-draft · rookie draft in ${pluralDays(daysBetween(Date.now(), startMs))}`;
      }
      return "Pre-draft";
    }
    case "drafting":
      return "Draft underway";
    case "in_season": {
      const latest = await latestCachedMatchupWeek();
      const week = latest?.season === season ? latest.week : null;
      const deadline = league.settings.trade_deadline;
      if (week !== null && deadline > week) {
        return `Week ${week} · trade window closes in ${pluralWeeks(deadline - week)}`;
      }
      if (week !== null) return `Week ${week}`;
      return "In season";
    }
    case "complete": {
      const { champ } = await resolveSeasonPodium(season);
      if (!champ) return "Season complete";
      return `Season complete · ${champ.manager.displayName} crowned`;
    }
  }
}

async function buildLede(
  season: string,
  league: SleeperLeague,
  lastCompleted: string | null,
): Promise<Lede | null> {
  switch (league.status) {
    case "pre_draft":
      return buildChampionLede(lastCompleted);
    case "drafting": {
      const drafts = await readDrafts(season).catch(() => []);
      const draft = drafts[0];
      if (!draft) return null;
      return { kind: "draft", draft };
    }
    case "in_season":
      return null;
    case "complete": {
      const { champ, runnerUp, champSeed } = await resolveSeasonPodium(season);
      if (!champ) return null;
      return {
        kind: "crowned",
        champ,
        runnerUp,
        champSeed,
        season,
      };
    }
  }
}

async function buildChampionLede(
  lastCompleted: string | null,
): Promise<Lede | null> {
  if (!lastCompleted) return null;
  const { champ, champSeed } = await resolveSeasonPodium(lastCompleted);
  if (!champ) return null;

  // Regular season, so the sparkline covers the same weeks as the record and
  // PF rendered beside it.
  const weeklyMap = await getWeeklyPointsByRoster(lastCompleted, {
    scope: "regular",
  });
  const weekly = weeklyMap.get(champ.rosterId) ?? [];

  // Champion's biggest 30-day mover among current starters (dynasty mode).
  let topMover: ValuedAsset | null = null;
  try {
    const dynasty = await buildDynastyRankings();
    const champRoster = dynasty.rosters.find(
      (r) => r.manager.userId === champ.manager.userId,
    );
    if (champRoster) {
      const sorted = [...champRoster.starters]
        .map((s) => s.asset)
        .filter((a) => Number.isFinite(a.trend30Day) && a.trend30Day !== 0)
        .sort((a, b) => Math.abs(b.trend30Day) - Math.abs(a.trend30Day));
      topMover = sorted[0] ?? null;
    }
  } catch {
    topMover = null;
  }

  return {
    kind: "champion",
    champ,
    champSeed,
    weekly,
    topMover,
    lastSeason: lastCompleted,
  };
}

