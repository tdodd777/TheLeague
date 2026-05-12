import { tepMultiplier } from "@/lib/fantasycalc";
import {
  getCurrentLeague,
  getManagers,
  getStandings,
  getWeeklyPointsByRoster,
  readDrafts,
  readPlayers,
  readRosters,
  readTradedPicks,
} from "@/lib/data";
import type { Manager } from "@/lib/types";
import type { SleeperRoster } from "@/lib/sleeper";

import { buildPickAsset, buildPlayerAsset, resolveSnapshot } from "./assets";
import { buildPickPortfolios } from "./pick-portfolio";
import { buildRosterValue } from "./roster-value";
import { computeSeasonPower, type SeasonInputs } from "./season-power";
import { getLatestSnapshot } from "./snapshot";
import type {
  RankingMode,
  RankingResult,
  RosterValueBreakdown,
  SeasonPowerBreakdown,
  ValuedAsset,
  ValueSnapshot,
} from "./types";

export interface EngineContext {
  season: string;
  snapshotDate: string;
  snapshot: ValueSnapshot;
  managers: Map<number, Manager>;
  rosters: SleeperRoster[];
  /** Per-roster pick assets, evaluated in dynasty mode (picks have no redraft value). */
  picksByRoster: Map<number, ValuedAsset[]>;
  /** Pre-built per-roster valued asset pools — recomputed per mode. */
}

/** Build the dynasty-mode ranking. */
export async function buildDynastyRankings(): Promise<RankingResult> {
  return buildRankings("dynasty");
}

/** Build the season-mode ranking (uses redraft values + actuals if available). */
export async function buildSeasonRankings(): Promise<{
  result: RankingResult;
  power: SeasonPowerBreakdown[];
}> {
  const result = await buildRankings("season");
  const power = await augmentWithSeasonPower(result);
  return { result, power };
}

async function buildRankings(mode: RankingMode): Promise<RankingResult> {
  const { season, league } = await getCurrentLeague();
  const { date: snapshotDate, snapshot } = await getLatestSnapshot();
  const [rosters, tradedPicks, drafts, managers, players] = await Promise.all([
    readRosters(season),
    readTradedPicks(season),
    readDrafts(season),
    getManagers(season),
    readPlayers(),
  ]);

  const tep = tepMultiplier(league.scoring_settings.bonus_rec_te ?? 0);
  const resolved = resolveSnapshot(snapshot, mode);

  // Pick portfolios are dynasty-only: redraft values for picks are not
  // meaningful (rookies aren't drafted yet).
  const portfolios = buildPickPortfolios(league, rosters, tradedPicks, drafts);

  const breakdowns: RosterValueBreakdown[] = [];
  for (const roster of rosters) {
    const manager = managers.byRosterId.get(roster.roster_id);
    if (!manager) continue;

    const taxiIds = new Set(roster.taxi ?? []);
    const reserveIds = new Set(roster.reserve ?? []);
    const allPlayers = roster.players ?? [];

    const activeIds = allPlayers.filter(
      (id) => id !== "0" && !taxiIds.has(id) && !reserveIds.has(id),
    );

    const activePool = activeIds.map((id) =>
      buildPlayerAsset(id, resolved, players, { tepMultiplier: tep }),
    );
    const reservePool = [...reserveIds].map((id) =>
      buildPlayerAsset(id, resolved, players, { tepMultiplier: tep }),
    );
    const taxiPool = [...taxiIds].map((id) =>
      buildPlayerAsset(id, resolved, players, { tepMultiplier: tep }),
    );

    let pickAssets: ValuedAsset[] = [];
    if (mode === "dynasty") {
      const picks = portfolios.get(roster.roster_id) ?? [];
      // Pick values come from the dynasty snapshot regardless of mode.
      const dynastyResolved = resolveSnapshot(snapshot, "dynasty");
      pickAssets = picks.map((p) => buildPickAsset(p, dynastyResolved));
    }

    breakdowns.push(
      buildRosterValue({
        manager,
        roster,
        rosterPositions: league.roster_positions,
        activePool,
        reservePool,
        taxiPool,
        picks: pickAssets,
        mode,
      }),
    );
  }

  breakdowns.sort((a, b) => b.total - a.total);

  const n = breakdowns.length || 1;
  const sum = breakdowns.reduce(
    (acc, b) => ({
      total: acc.total + b.total,
      starterValue: acc.starterValue + b.starterValue,
      benchValue: acc.benchValue + b.benchValue,
      pickValue: acc.pickValue + b.pickValue,
      studBonus: acc.studBonus + b.studBonus,
    }),
    { total: 0, starterValue: 0, benchValue: 0, pickValue: 0, studBonus: 0 },
  );

  return {
    mode,
    season,
    snapshotDate,
    rosters: breakdowns,
    leagueAverages: {
      total: sum.total / n,
      starterValue: sum.starterValue / n,
      benchValue: sum.benchValue / n,
      pickValue: sum.pickValue / n,
      studBonus: sum.studBonus / n,
    },
  };
}

/**
 * Compute season power scores. Pulls actual results from the most recent
 * season that has games on the books. If the current season has results
 * (mid-season), use it. Otherwise pre-season — only the value component
 * contributes.
 */
async function augmentWithSeasonPower(
  ranking: RankingResult,
): Promise<SeasonPowerBreakdown[]> {
  const { season } = ranking;
  const standings = await getStandings(season);
  const weeklyMap = await getWeeklyPointsByRoster(season);

  // Detect pre-season: if no games at all across the league, weeklyMap will
  // either be empty or all rosters have 0 games. In that case all the
  // performance-based components are 0 — pure value-based ranking.
  const totalGames = [...weeklyMap.values()].reduce(
    (s, arr) => s + arr.length,
    0,
  );
  void totalGames;

  const rosterById = new Map(ranking.rosters.map((r) => [r.rosterId, r]));
  const standingsById = new Map(standings.map((s) => [s.rosterId, s]));

  const inputs: SeasonInputs[] = [];
  for (const breakdown of ranking.rosters) {
    const wk = weeklyMap.get(breakdown.rosterId) ?? [];
    const st = standingsById.get(breakdown.rosterId);
    inputs.push({
      rosterId: breakdown.rosterId,
      manager: breakdown.manager,
      seasonValue: breakdown,
      weekly: wk,
      pointsFor: st?.pf ?? 0,
      actualWins: st?.wins ?? 0,
      actualLosses: st?.losses ?? 0,
      actualTies: st?.ties ?? 0,
      potentialPoints: st?.ppts ?? 0,
    });
  }

  void rosterById;

  return computeSeasonPower(inputs, weeklyMap);
}

/**
 * Helper: build season-power results for a *specific* historical season,
 * useful for the manager profile's "last season's verdict" stat strip and
 * for the season-rankings page when the current season is pre-draft.
 */
export async function buildHistoricalSeasonContext(historicalSeason: string): Promise<{
  weeklyByRoster: Map<number, number[]>;
  power: SeasonPowerBreakdown[];
}> {
  const { snapshot } = await getLatestSnapshot();
  const { league } = await getCurrentLeague();
  const [rosters, managers, standings, weeklyMap, players] = await Promise.all([
    readRosters(historicalSeason),
    getManagers(historicalSeason),
    getStandings(historicalSeason),
    getWeeklyPointsByRoster(historicalSeason),
    readPlayers(),
  ]);

  // Use redraft values for the historical-season's optimal lineup.
  const tep = tepMultiplier(league.scoring_settings.bonus_rec_te ?? 0);
  const resolved = resolveSnapshot(snapshot, "season");

  const inputs: SeasonInputs[] = [];
  for (const roster of rosters) {
    const manager = managers.byRosterId.get(roster.roster_id);
    if (!manager) continue;

    const taxiIds = new Set(roster.taxi ?? []);
    const reserveIds = new Set(roster.reserve ?? []);
    const allPlayers = roster.players ?? [];
    const activeIds = allPlayers.filter(
      (id) => id !== "0" && !taxiIds.has(id) && !reserveIds.has(id),
    );

    const activePool = activeIds.map((id) =>
      buildPlayerAsset(id, resolved, players, { tepMultiplier: tep }),
    );
    const reservePool = [...reserveIds].map((id) =>
      buildPlayerAsset(id, resolved, players, { tepMultiplier: tep }),
    );
    const taxiPool = [...taxiIds].map((id) =>
      buildPlayerAsset(id, resolved, players, { tepMultiplier: tep }),
    );

    const breakdown = buildRosterValue({
      manager,
      roster,
      rosterPositions: league.roster_positions,
      activePool,
      reservePool,
      taxiPool,
      picks: [],
      mode: "season",
    });

    const st = standings.find((s) => s.rosterId === roster.roster_id);
    const wk = weeklyMap.get(roster.roster_id) ?? [];
    inputs.push({
      rosterId: roster.roster_id,
      manager,
      seasonValue: breakdown,
      weekly: wk,
      pointsFor: st?.pf ?? 0,
      actualWins: st?.wins ?? 0,
      actualLosses: st?.losses ?? 0,
      actualTies: st?.ties ?? 0,
      potentialPoints: st?.ppts ?? 0,
    });
  }

  return {
    weeklyByRoster: weeklyMap,
    power: computeSeasonPower(inputs, weeklyMap),
  };
}
