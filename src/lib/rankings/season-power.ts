import type { Manager } from "@/lib/types";

import {
  LAST_N_WEEKS,
  SEASON_POWER_VALUE_DIVISOR,
  SEASON_POWER_WEIGHTS,
} from "./constants";
import type { RosterValueBreakdown, SeasonPowerBreakdown } from "./types";

export interface SeasonInputs {
  rosterId: number;
  manager: Manager;
  /** Per-roster roster value breakdown, computed in season (redraft) mode. */
  seasonValue: RosterValueBreakdown;
  /** Weekly points scored by this roster, in chronological order. May be empty (pre-season). */
  weekly: number[];
  /** Sum of weekly points (Sleeper's "fpts"). Available even for completed games. */
  pointsFor: number;
  /** Season actuals from standings. */
  actualWins: number;
  actualLosses: number;
  actualTies: number;
  /** Sleeper's potential points if every team had set the optimal lineup each week. */
  potentialPoints: number;
}

/**
 * For each week, compare your score to every other team's score that week.
 * Wins-this-week = number of teams whose score is below yours; losses = above;
 * ties = equal. Sum across weeks to get a luck-adjusted record.
 */
export function computeAllPlayRecord(weeklyByRoster: Map<number, number[]>): Map<
  number,
  { wins: number; losses: number; ties: number }
> {
  const result = new Map<number, { wins: number; losses: number; ties: number }>();
  for (const [rosterId] of weeklyByRoster) {
    result.set(rosterId, { wins: 0, losses: 0, ties: 0 });
  }
  // Determine the max number of weeks any roster has logged.
  let maxWeeks = 0;
  for (const [, arr] of weeklyByRoster) maxWeeks = Math.max(maxWeeks, arr.length);
  for (let w = 0; w < maxWeeks; w += 1) {
    const scores: Array<{ rosterId: number; score: number }> = [];
    for (const [rosterId, arr] of weeklyByRoster) {
      const s = arr[w];
      if (typeof s === "number" && Number.isFinite(s)) {
        scores.push({ rosterId, score: s });
      }
    }
    if (scores.length < 2) continue;
    for (const me of scores) {
      const cell = result.get(me.rosterId);
      if (!cell) continue;
      for (const other of scores) {
        if (other.rosterId === me.rosterId) continue;
        if (me.score > other.score) cell.wins += 1;
        else if (me.score < other.score) cell.losses += 1;
        else cell.ties += 1;
      }
    }
  }
  return result;
}

export function computeSeasonPower(
  inputs: readonly SeasonInputs[],
  weeklyByRoster: Map<number, number[]>,
): SeasonPowerBreakdown[] {
  const allPlay = computeAllPlayRecord(weeklyByRoster);

  // League weekly mean: average of all per-roster per-week scores.
  let weeklyTotal = 0;
  let weeklyCount = 0;
  for (const [, arr] of weeklyByRoster) {
    for (const s of arr) {
      if (Number.isFinite(s)) {
        weeklyTotal += s;
        weeklyCount += 1;
      }
    }
  }
  const leagueAvgWeek = weeklyCount > 0 ? weeklyTotal / weeklyCount : 0;

  const out: SeasonPowerBreakdown[] = [];
  for (const r of inputs) {
    const wk = r.weekly;
    const games = wk.length;
    const ppg = games > 0 ? r.pointsFor / games : 0;
    const ppgIndex = leagueAvgWeek > 0 && games > 0 ? ppg / leagueAvgWeek : 0;

    const lastN = wk.slice(-LAST_N_WEEKS);
    const last3Avg =
      lastN.length > 0 ? lastN.reduce((a, b) => a + b, 0) / lastN.length : 0;
    const last3Index = leagueAvgWeek > 0 && lastN.length > 0 ? last3Avg / leagueAvgWeek : 0;

    const ap = allPlay.get(r.rosterId) ?? { wins: 0, losses: 0, ties: 0 };
    const apTotal = ap.wins + ap.losses + ap.ties;
    const allPlayPct = apTotal > 0 ? ap.wins / apTotal : 0;

    const valueComponent =
      (r.seasonValue.starterValue / SEASON_POWER_VALUE_DIVISOR) *
      SEASON_POWER_WEIGHTS.optimalStarterValue;
    const ppgComponent = ppgIndex * SEASON_POWER_WEIGHTS.ppgIndex;
    const last3Component = last3Index * SEASON_POWER_WEIGHTS.last3;
    const allPlayComponent = allPlayPct * SEASON_POWER_WEIGHTS.allPlay;
    const total =
      valueComponent + ppgComponent + last3Component + allPlayComponent;

    const expectedWins = allPlayPct * games;
    const scheduleLuck = r.actualWins - expectedWins;

    // Weekly power: per-week PF / leagueAvgWeek. Hovers around 1.
    const weeklyPower =
      leagueAvgWeek > 0
        ? wk.map((s) => (Number.isFinite(s) ? s / leagueAvgWeek : 0))
        : wk.map(() => 0);

    const lineupIQ =
      r.potentialPoints > 0 ? Math.min(1, r.pointsFor / r.potentialPoints) : null;

    out.push({
      rosterId: r.rosterId,
      manager: r.manager,
      seasonValue: r.seasonValue,
      optimalStarterValue: r.seasonValue.starterValue,
      ppgIndex,
      last3Index,
      allPlayPct,
      allPlayWins: ap.wins,
      allPlayLosses: ap.losses,
      actualWins: r.actualWins,
      actualLosses: r.actualLosses,
      actualTies: r.actualTies,
      gamesPlayed: games,
      expectedWins,
      scheduleLuck,
      weeklyPower,
      lineupIQ,
      total,
    });
  }

  out.sort((a, b) => b.total - a.total);
  return out;
}
