import type { Manager } from "@/lib/types";
import type { SleeperRoster, SleeperRosterPosition } from "@/lib/sleeper";

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

export function buildRosterValue(input: BuildRosterValueInput): RosterValueBreakdown {
  const { manager, roster, rosterPositions, activePool, reservePool, taxiPool, picks, mode } = input;

  const { starters, remainingIds } = optimizeLineup(rosterPositions, activePool);
  const remainder = activePool.filter((a) => remainingIds.has(a.assetId));
  const remainderSorted = [...remainder].sort((a, b) => b.value - a.value);
  const bench = remainderSorted.slice(0, BENCH_TOP_N);
  const benchOverflow = remainderSorted.slice(BENCH_TOP_N);

  const starterValue = starters.reduce((s, x) => s + x.asset.value, 0);
  const benchValue = bench.reduce((s, x) => s + x.value, 0) * TIER_MULTIPLIERS.bench;
  // Reserve = Sleeper IR + bench overflow (all weighted at 0.2 per ARCHITECTURE.md §6).
  const reservePoolFull: ValuedAsset[] = [...benchOverflow, ...reservePool];
  const reserveValue = reservePoolFull.reduce((s, x) => s + x.value, 0) * TIER_MULTIPLIERS.reserve;
  const taxiValue =
    mode === "dynasty"
      ? taxiPool.reduce((s, x) => s + x.value, 0) * TIER_MULTIPLIERS.taxi
      : 0;
  const pickValue = mode === "dynasty"
    ? picks.reduce((s, x) => s + x.value, 0) * TIER_MULTIPLIERS.pick
    : 0;
  const bonus = studBonus(starters);

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

  const starterAvgAge = safeAvg(
    starters.map((s) => (s.asset.age ?? Number.NaN)),
  );
  const rosterAvgAge = safeAvg(
    [...activePool, ...reservePool, ...taxiPool].map(
      (a) => (a.age ?? Number.NaN),
    ),
  );
  const trend30Day = starters.reduce((s, x) => s + x.asset.trend30Day, 0);

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
  };
}
