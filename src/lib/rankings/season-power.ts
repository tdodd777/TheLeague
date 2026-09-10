import type { Manager } from "@/lib/types";

import { LAST_N_WEEKS, SEASON_POWER_WEIGHTS } from "./constants";
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
 * A season-power row plus the league-relative indices the composite is built
 * from. Extends SeasonPowerBreakdown, so every existing consumer keeps working.
 */
export interface SeasonPowerRow extends SeasonPowerBreakdown {
  /** optimal starter value / league mean optimal starter value. 1.0 = league mean. */
  valueIndex: number;
  /** allPlayPct / 0.5, so 1.0 = league mean. */
  allPlayIndex: number;
  /**
   * True when the league mean optimal starter value is not a positive number,
   * which means the value component could not be computed at all and the
   * composite is not trustworthy. Show "ranking unavailable" rather than the
   * score. Never silently treated as an index of 1.0.
   */
  rankingUnavailable: boolean;
}

/** Mean of the finite entries. Returns 0 when there is nothing to average. */
function meanOf(values: readonly number[]): number {
  let total = 0;
  let count = 0;
  for (const v of values) {
    if (Number.isFinite(v)) {
      total += v;
      count += 1;
    }
  }
  return count > 0 ? total / count : 0;
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

/**
 * Season power composite. Every component is a league-relative index centred on
 * 1.0, so the 40/30/20/10 weights mean what they say:
 *
 *   valueIndex   = optimal starter value / league mean optimal starter value
 *   ppgIndex     = ppg / league mean ppg
 *   last3Index   = last-3 average / league mean over that same trailing window
 *   allPlayIndex = all-play win pct / 0.5
 *
 *   score = 100 × Σ(weight × index) / Σ(active weights)
 *
 * A component is active only when it has data behind it, and the divisor is the
 * sum of the active weights. That keeps the scale at ~100 for a league-average
 * team whether it is pre-season (value only) or mid-season (all four).
 */
export function computeSeasonPower(
  inputs: readonly SeasonInputs[],
  weeklyByRoster: Map<number, number[]>,
): SeasonPowerRow[] {
  const allPlay = computeAllPlayRecord(weeklyByRoster);

  // League weekly mean: average of all per-roster per-week scores. Also the
  // league mean PPG, since every score in the pool is one roster-week.
  const allWeekScores: number[] = [];
  // Same, restricted to each roster's trailing window — the last3 component has
  // to be indexed against the same window it measures, not the whole season.
  const trailingWeekScores: number[] = [];
  for (const [, arr] of weeklyByRoster) {
    for (const s of arr) allWeekScores.push(s);
    for (const s of arr.slice(-LAST_N_WEEKS)) trailingWeekScores.push(s);
  }
  const leagueMeanPpg = meanOf(allWeekScores);
  const leagueMeanLast3 = meanOf(trailingWeekScores);

  const leagueMeanOsv = meanOf(inputs.map((r) => r.seasonValue.starterValue));
  const valueAvailable = leagueMeanOsv > 0;

  const out: SeasonPowerRow[] = [];
  for (const r of inputs) {
    const wk = r.weekly;
    const games = wk.length;
    const ppg = games > 0 ? r.pointsFor / games : 0;

    const lastN = wk.slice(-LAST_N_WEEKS);
    const last3Avg = meanOf(lastN);

    const ap = allPlay.get(r.rosterId) ?? { wins: 0, losses: 0, ties: 0 };
    const apTotal = ap.wins + ap.losses + ap.ties;
    // A tie is half a win, not a loss.
    const allPlayPct = apTotal > 0 ? (ap.wins + 0.5 * ap.ties) / apTotal : 0;

    const ppgAvailable = games > 0 && leagueMeanPpg > 0;
    const last3Available = lastN.length > 0 && leagueMeanLast3 > 0;
    const allPlayAvailable = apTotal > 0;

    const valueIndex = valueAvailable
      ? r.seasonValue.starterValue / leagueMeanOsv
      : 0;
    const ppgIndex = ppgAvailable ? ppg / leagueMeanPpg : 0;
    const last3Index = last3Available ? last3Avg / leagueMeanLast3 : 0;
    const allPlayIndex = allPlayAvailable ? allPlayPct / 0.5 : 0;

    let weighted = 0;
    let activeWeight = 0;
    if (valueAvailable) {
      weighted += SEASON_POWER_WEIGHTS.optimalStarterValue * valueIndex;
      activeWeight += SEASON_POWER_WEIGHTS.optimalStarterValue;
    }
    if (ppgAvailable) {
      weighted += SEASON_POWER_WEIGHTS.ppgIndex * ppgIndex;
      activeWeight += SEASON_POWER_WEIGHTS.ppgIndex;
    }
    if (last3Available) {
      weighted += SEASON_POWER_WEIGHTS.last3 * last3Index;
      activeWeight += SEASON_POWER_WEIGHTS.last3;
    }
    if (allPlayAvailable) {
      weighted += SEASON_POWER_WEIGHTS.allPlay * allPlayIndex;
      activeWeight += SEASON_POWER_WEIGHTS.allPlay;
    }
    const total = activeWeight > 0 ? (100 * weighted) / activeWeight : 0;

    // Both halves of schedule luck must describe the same weeks. `actualWins`
    // comes from Sleeper's live record, which counts the in-progress week the
    // moment it is decided, while `games` counts only completed weeks. Scoring
    // expected wins over the record's own game count keeps the league-wide sum
    // at zero mid-week instead of drifting by a full week of wins.
    const decidedGames = r.actualWins + r.actualLosses + r.actualTies;
    const luckGames = decidedGames > 0 ? decidedGames : games;
    const expectedWins = allPlayPct * luckGames;
    const scheduleLuck = r.actualWins - expectedWins;

    // Weekly power: per-week PF / leagueMeanPpg. Hovers around 1.
    const weeklyPower =
      leagueMeanPpg > 0
        ? wk.map((s) => (Number.isFinite(s) ? s / leagueMeanPpg : 0))
        : wk.map(() => 0);

    const lineupIQ =
      r.potentialPoints > 0 ? Math.min(1, r.pointsFor / r.potentialPoints) : null;

    out.push({
      rosterId: r.rosterId,
      manager: r.manager,
      seasonValue: r.seasonValue,
      optimalStarterValue: r.seasonValue.starterValue,
      valueIndex,
      ppgIndex,
      last3Index,
      allPlayPct,
      allPlayIndex,
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
      rankingUnavailable: !valueAvailable,
    });
  }

  out.sort((a, b) => b.total - a.total);
  return out;
}
