import type { Manager } from "@/lib/types";
import type { SleeperRoster, SleeperRosterPosition } from "@/lib/sleeper";

import { isUnvaluedPosition } from "./assets";
import {
  BENCH_TOP_N,
  STUD_BONUS_RATE,
  STUD_THRESHOLD,
  TIER_MULTIPLIERS,
} from "./constants";
import { optimizeLineup } from "./lineup-optimizer";
import type {
  RankingMode,
  RosterValueBreakdown,
  StarterAssignment,
  ValuedAsset,
} from "./types";

/** What the starter value covers, and what it had to leave out. */
export interface StarterValueCoverage {
  /** Starting slots that did contribute to starterValue. */
  valuedStarters: number;
  /** Starting slots held out because the snapshot cannot price them. */
  unvaluedStarters: number;
  /** Which positions were held out, in lineup order. Always a subset of UNVALUED_POSITIONS. */
  unvaluedPositions: string[];
}

/**
 * `buildRosterValue`'s return, widened with the coverage note. Assignable
 * anywhere a plain `RosterValueBreakdown` is expected, so existing consumers
 * are untouched.
 */
export interface RosterValueBreakdownWithCoverage extends RosterValueBreakdown {
  /**
   * Which starting slots the value figures above actually cover. Identical for
   * every roster in this league (one K slot, one DEF slot), so it never moves
   * a ranking — it is here so the UI can footnote that "optimal lineup value"
   * prices 8 of the 10 mandatory starters.
   */
  starterValueCoverage: StarterValueCoverage;
}

/**
 * Split the optimal lineup into the slots the snapshot can price and the slots
 * it cannot. Exported so a consumer holding only the base `RosterValueBreakdown`
 * type can recompute the footnote from `breakdown.starters` without a cast.
 */
export function computeStarterValueCoverage(
  starters: readonly StarterAssignment[],
): StarterValueCoverage {
  const unvalued = starters.filter((s) => isUnvaluedPosition(s.asset.position));
  return {
    valuedStarters: starters.length - unvalued.length,
    unvaluedStarters: unvalued.length,
    unvaluedPositions: unvalued.map((s) => s.asset.position),
  };
}

interface BuildRosterValueInput {
  manager: Manager;
  roster: SleeperRoster;
  rosterPositions: readonly SleeperRosterPosition[];
  /** Players on the active/bench roster (no taxi/IR). */
  activePool: readonly ValuedAsset[];
  /** Players on IR. Sleeper exposes them via `roster.reserve`. */
  reservePool: readonly ValuedAsset[];
  /** Taxi squad. */
  taxiPool: readonly ValuedAsset[];
  /** Pick assets owned by this roster. */
  picks: readonly ValuedAsset[];
  mode: RankingMode;
}

function safeAvg(values: number[]): number | null {
  const present = values.filter((v) => Number.isFinite(v));
  if (present.length === 0) return null;
  return present.reduce((a, b) => a + b, 0) / present.length;
}

function studBonus(starters: readonly StarterAssignment[]): number {
  let bonus = 0;
  for (const s of starters) {
    bonus += Math.max(0, s.asset.value - STUD_THRESHOLD) * STUD_BONUS_RATE;
  }
  return bonus;
}

export function buildRosterValue(
  input: BuildRosterValueInput,
): RosterValueBreakdownWithCoverage {
  const { manager, roster, rosterPositions, activePool, reservePool, taxiPool, picks, mode } = input;

  const { starters, remainingIds } = optimizeLineup(rosterPositions, activePool);
  const remainder = activePool.filter((a) => remainingIds.has(a.assetId));
  const remainderSorted = [...remainder].sort((a, b) => b.value - a.value);
  const bench = remainderSorted.slice(0, BENCH_TOP_N);
  const benchOverflow = remainderSorted.slice(BENCH_TOP_N);

  // K and DEF stay in `starters` (the lineup card still renders both slots) but
  // are held out of every value figure. The snapshot prices neither, so folding
  // them in at 0 would dress absence up as a valuation. See UNVALUED_POSITIONS.
  const starterValueCoverage = computeStarterValueCoverage(starters);
  const valuedStarters = starters.filter(
    (s) => !isUnvaluedPosition(s.asset.position),
  );

  const starterValue = valuedStarters.reduce((s, x) => s + x.asset.value, 0);
  const benchValue = bench.reduce((s, x) => s + x.value, 0) * TIER_MULTIPLIERS.bench;
  // Reserve = Sleeper IR + bench overflow (all weighted at 0.2 per RANKINGS.md §6).
  const reservePoolFull: ValuedAsset[] = [...benchOverflow, ...reservePool];
  const reserveValue = reservePoolFull.reduce((s, x) => s + x.value, 0) * TIER_MULTIPLIERS.reserve;
  const taxiValue =
    mode === "dynasty"
      ? taxiPool.reduce((s, x) => s + x.value, 0) * TIER_MULTIPLIERS.taxi
      : 0;
  const pickValue = mode === "dynasty"
    ? picks.reduce((s, x) => s + x.value, 0) * TIER_MULTIPLIERS.pick
    : 0;
  const bonus = studBonus(valuedStarters);

  const total =
    starterValue + benchValue + reserveValue + taxiValue + pickValue + bonus;

  // Position breakdown — sum unweighted values across the entire active +
  // taxi + reserve pool (no picks). Used for the bar visualization.
  const byPosition: Record<string, number> = {};
  function addToBucket(pool: readonly ValuedAsset[]): void {
    for (const a of pool) {
      const key = a.position;
      byPosition[key] = (byPosition[key] ?? 0) + a.value;
    }
  }
  addToBucket(activePool);
  addToBucket(reservePool);
  if (mode === "dynasty") addToBucket(taxiPool);
  if (mode === "dynasty") {
    byPosition["PICK"] = picks.reduce((s, x) => s + x.value, 0);
  }

  // Age averages describe the skill-position core, so K and DEF are filtered
  // out BY POSITION. Filtering on value instead would also swallow a genuinely
  // unmatched QB/RB/WR/TE, which is exactly the roster hole the age curve
  // should still show. (Rostered kickers average 28.2 against 26.2 for skill
  // players, so they were dragging every starter average up. DEF carries no age
  // in players.json at all, so it never reached these averages either way.)
  const starterAvgAge = safeAvg(
    valuedStarters.map((s) => (s.asset.age ?? Number.NaN)),
  );
  const rosterAvgAge = safeAvg(
    [...activePool, ...reservePool, ...taxiPool]
      .filter((a) => !isUnvaluedPosition(a.position))
      .map((a) => (a.age ?? Number.NaN)),
  );
  const trend30Day = valuedStarters.reduce(
    (s, x) => s + x.asset.trend30Day,
    0,
  );

  return {
    rosterId: roster.roster_id,
    manager,
    mode,
    starterValue,
    benchValue,
    reserveValue,
    taxiValue,
    pickValue,
    studBonus: bonus,
    total,
    byPosition,
    starters,
    bench,
    reserve: reservePoolFull,
    taxi: [...taxiPool],
    picks: [...picks],
    starterAvgAge,
    rosterAvgAge,
    trend30Day,
    starterValueCoverage,
  };
}
