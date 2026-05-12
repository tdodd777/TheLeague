import type { Manager } from "@/lib/types";

import { listCachedSeasons, readMatchups } from "./cache";
import { getSeasonPlacements } from "./brackets";
import { getManagers } from "./managers";
import { getStandings } from "./standings";

export interface WeekScoreRow {
  season: string;
  week: number;
  manager: Manager;
  points: number;
}

export interface MatchupMarginRow {
  season: string;
  week: number;
  winner: Manager;
  loser: Manager;
  winnerPoints: number;
  loserPoints: number;
  margin: number;
}

export interface SeasonScoreRow {
  season: string;
  manager: Manager;
  pf: number;
  /** Wins-Losses-Ties for the season, used as subValue. */
  record: string;
}

export interface StreakRow {
  manager: Manager;
  /** Streak length. */
  length: number;
  /** Result type ("W" or "L"). */
  type: "W" | "L";
  /** When the streak started. */
  startSeason: string;
  startWeek: number;
  /** Final game of the streak. */
  endSeason: string;
  endWeek: number;
}

export interface ChampionRow {
  manager: Manager;
  titles: string[];
}

export interface SeasonRecords {
  season: string;
  topWeeks: WeekScoreRow[];
  bottomWeeks: WeekScoreRow[];
  biggestBlowouts: MatchupMarginRow[];
  closestGames: MatchupMarginRow[];
}

export interface AllTimeRecords {
  topWeeks: WeekScoreRow[];
  bottomWeeks: WeekScoreRow[];
  biggestBlowouts: MatchupMarginRow[];
  closestGames: MatchupMarginRow[];
  topSeasons: SeasonScoreRow[];
  bottomSeasons: SeasonScoreRow[];
  longestWinStreak: StreakRow | null;
  longestLossStreak: StreakRow | null;
  champions: ChampionRow[];
  /** Number of seasons that contributed games to the dataset. */
  seasonsCounted: string[];
}

export interface AllRecords {
  allTime: AllTimeRecords;
  perSeason: SeasonRecords[];
}

/**
 * Walks every cached season and assembles all-time + per-season records.
 *
 * Excludes weeks that didn't actually happen (matchups with both 0 points are
 * unplayed weeks) and seasons that haven't started (rosters with 0 W-L-T).
 */
export async function getRecords(): Promise<AllRecords> {
  const seasons = await listCachedSeasons();

  const allWeekScores: WeekScoreRow[] = [];
  const allMatchupMargins: MatchupMarginRow[] = [];
  const allSeasonScores: SeasonScoreRow[] = [];
  const seasonRecords: SeasonRecords[] = [];
  const seasonsCounted = new Set<string>();

  // Per-manager streak tracking — chronological walk across (season asc, week asc).
  // We need games sorted oldest-first; we'll collect then sort.
  interface Game {
    season: string;
    week: number;
    rosterId: number;
    points: number;
    oppPoints: number;
    result: "W" | "L" | "T";
    manager: Manager;
  }
  const allGames: Game[] = [];

  // Champions: roster-id → seasons won. We build per-userId at the end.
  const titlesByUser = new Map<string, { manager: Manager; titles: string[] }>();

  for (const season of seasons) {
    const managers = await getManagers(season);
    const standings = await getStandings(season);
    const placements = await getSeasonPlacements(season);

    const seasonHasGames = standings.some(
      (s) => s.wins + s.losses + s.ties > 0,
    );
    if (!seasonHasGames) continue;
    seasonsCounted.add(season);

    // Season totals.
    for (const s of standings) {
      if (s.wins + s.losses + s.ties === 0) continue;
      allSeasonScores.push({
        season,
        manager: s.manager,
        pf: s.pf,
        record: `${s.wins}-${s.losses}${s.ties ? `-${s.ties}` : ""}`,
      });
    }

    // Champion (placement === 1).
    if (placements.champion !== null) {
      const champManager = managers.byRosterId.get(placements.champion);
      if (champManager) {
        const existing = titlesByUser.get(champManager.userId);
        if (existing) {
          existing.titles.push(season);
        } else {
          titlesByUser.set(champManager.userId, {
            manager: champManager,
            titles: [season],
          });
        }
      }
    }

    // Per-week scores + matchup margins.
    const seasonWeekScores: WeekScoreRow[] = [];
    const seasonMargins: MatchupMarginRow[] = [];
    for (let week = 1; week <= 18; week += 1) {
      const matchups = await readMatchups(season, week);
      if (!matchups) continue;
      // Group by matchup_id for margins.
      const byMatchup = new Map<number, typeof matchups>();
      for (const m of matchups) {
        if (m.points === 0) continue; // skip unplayed weeks
        const arr = byMatchup.get(m.matchup_id) ?? [];
        arr.push(m);
        byMatchup.set(m.matchup_id, arr);

        const manager = managers.byRosterId.get(m.roster_id);
        if (manager) {
          seasonWeekScores.push({
            season,
            week,
            manager,
            points: m.points,
          });
        }
      }
      for (const [, pair] of byMatchup) {
        if (pair.length !== 2) continue;
        const [a, b] = pair;
        if (!a || !b) continue;
        if (a.points === 0 && b.points === 0) continue;
        const aManager = managers.byRosterId.get(a.roster_id);
        const bManager = managers.byRosterId.get(b.roster_id);
        if (!aManager || !bManager) continue;
        const winner = a.points > b.points ? aManager : bManager;
        const loser = a.points > b.points ? bManager : aManager;
        const winnerPoints = Math.max(a.points, b.points);
        const loserPoints = Math.min(a.points, b.points);
        const margin = winnerPoints - loserPoints;
        seasonMargins.push({
          season,
          week,
          winner,
          loser,
          winnerPoints,
          loserPoints,
          margin,
        });

        // Streak tracking — only regular-season games. Sleeper marks playoff
        // weeks the same way; conventionally we only count regular-season for
        // win/loss streaks. Detect playoffs by week >= playoff_week_start.
        // We'll filter with a per-season cap below.
        const aResult: "W" | "L" | "T" =
          a.points > b.points ? "W" : a.points < b.points ? "L" : "T";
        const bResult: "W" | "L" | "T" =
          b.points > a.points ? "W" : b.points < a.points ? "L" : "T";
        allGames.push({
          season,
          week,
          rosterId: a.roster_id,
          points: a.points,
          oppPoints: b.points,
          result: aResult,
          manager: aManager,
        });
        allGames.push({
          season,
          week,
          rosterId: b.roster_id,
          points: b.points,
          oppPoints: a.points,
          result: bResult,
          manager: bManager,
        });
      }
    }
    allWeekScores.push(...seasonWeekScores);
    allMatchupMargins.push(...seasonMargins);

    seasonRecords.push({
      season,
      topWeeks: [...seasonWeekScores]
        .sort((a, b) => b.points - a.points)
        .slice(0, 5),
      bottomWeeks: [...seasonWeekScores]
        .sort((a, b) => a.points - b.points)
        .slice(0, 5),
      biggestBlowouts: [...seasonMargins]
        .sort((a, b) => b.margin - a.margin)
        .slice(0, 5),
      closestGames: [...seasonMargins]
        .filter((m) => m.margin > 0)
        .sort((a, b) => a.margin - b.margin)
        .slice(0, 5),
    });
  }

  // Sort and slice all-time leaderboards.
  const topWeeks = [...allWeekScores]
    .sort((a, b) => b.points - a.points)
    .slice(0, 10);
  const bottomWeeks = [...allWeekScores]
    .sort((a, b) => a.points - b.points)
    .slice(0, 10);
  const biggestBlowouts = [...allMatchupMargins]
    .sort((a, b) => b.margin - a.margin)
    .slice(0, 10);
  const closestGames = [...allMatchupMargins]
    .filter((m) => m.margin > 0)
    .sort((a, b) => a.margin - b.margin)
    .slice(0, 10);
  const topSeasons = [...allSeasonScores]
    .sort((a, b) => b.pf - a.pf)
    .slice(0, 10);
  const bottomSeasons = [...allSeasonScores]
    .sort((a, b) => a.pf - b.pf)
    .slice(0, 10);

  // Streaks: walk per-userId chronologically. Chain across seasons (so a
  // hot run that bridges the offseason still counts) but still report the
  // single longest run. Tie-breaker: most recent.
  allGames.sort((a, b) => {
    if (a.season !== b.season) return a.season.localeCompare(b.season);
    return a.week - b.week;
  });
  const byUser = new Map<string, Game[]>();
  for (const g of allGames) {
    const arr = byUser.get(g.manager.userId) ?? [];
    arr.push(g);
    byUser.set(g.manager.userId, arr);
  }

  let longestWinStreak: StreakRow | null = null;
  let longestLossStreak: StreakRow | null = null;
  for (const [, games] of byUser) {
    let wRun = 0;
    let lRun = 0;
    let wStart: { season: string; week: number } | null = null;
    let lStart: { season: string; week: number } | null = null;
    let lastW: Game | null = null;
    let lastL: Game | null = null;

    for (const g of games) {
      if (g.result === "W") {
        wRun += 1;
        if (wRun === 1) wStart = { season: g.season, week: g.week };
        lastW = g;
        lRun = 0;
        lStart = null;
      } else if (g.result === "L") {
        lRun += 1;
        if (lRun === 1) lStart = { season: g.season, week: g.week };
        lastL = g;
        wRun = 0;
        wStart = null;
      } else {
        wRun = 0;
        lRun = 0;
        wStart = null;
        lStart = null;
      }

      if (wRun > 0 && wStart && lastW) {
        if (
          !longestWinStreak ||
          wRun > longestWinStreak.length ||
          (wRun === longestWinStreak.length &&
            lastW.season > longestWinStreak.endSeason)
        ) {
          longestWinStreak = {
            manager: lastW.manager,
            length: wRun,
            type: "W",
            startSeason: wStart.season,
            startWeek: wStart.week,
            endSeason: lastW.season,
            endWeek: lastW.week,
          };
        }
      }
      if (lRun > 0 && lStart && lastL) {
        if (
          !longestLossStreak ||
          lRun > longestLossStreak.length ||
          (lRun === longestLossStreak.length &&
            lastL.season > longestLossStreak.endSeason)
        ) {
          longestLossStreak = {
            manager: lastL.manager,
            length: lRun,
            type: "L",
            startSeason: lStart.season,
            startWeek: lStart.week,
            endSeason: lastL.season,
            endWeek: lastL.week,
          };
        }
      }
    }
  }

  const champions: ChampionRow[] = [...titlesByUser.values()]
    .map((c) => ({ ...c, titles: c.titles.sort() }))
    .sort((a, b) => b.titles.length - a.titles.length);

  return {
    allTime: {
      topWeeks,
      bottomWeeks,
      biggestBlowouts,
      closestGames,
      topSeasons,
      bottomSeasons,
      longestWinStreak,
      longestLossStreak,
      champions,
      seasonsCounted: [...seasonsCounted].sort(),
    },
    perSeason: seasonRecords,
  };
}
