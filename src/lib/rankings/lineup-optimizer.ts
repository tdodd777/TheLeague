import type { SleeperRosterPosition } from "@/lib/sleeper";

import type { StarterAssignment, StarterSlot, ValuedAsset } from "./types";

/** Sleeper roster_position codes that are not actual starting slots. */
const NON_STARTING: ReadonlySet<SleeperRosterPosition> = new Set([
  "BN",
  "IR",
  "TAXI",
]);

/** Fixed-position slots (non-flex). */
const FIXED_POSITIONS: ReadonlySet<StarterSlot> = new Set([
  "QB",
  "RB",
  "WR",
  "TE",
  "K",
  "DEF",
]);

/** Which player positions are eligible for each flex variant. */
const FLEX_ELIGIBLE: Record<
  "FLEX" | "REC_FLEX" | "WRRB_FLEX" | "SUPER_FLEX",
  ReadonlySet<string>
> = {
  FLEX: new Set(["RB", "WR", "TE"]),
  REC_FLEX: new Set(["WR", "TE"]),
  WRRB_FLEX: new Set(["RB", "WR"]),
  SUPER_FLEX: new Set(["QB", "RB", "WR", "TE"]),
};

interface OptimizerResult {
  starters: StarterAssignment[];
  /** Asset IDs that did not make the starting lineup (eligible bench pool). */
  remainingIds: Set<string>;
}

/**
 * Optimize a starting lineup by picking the highest-value player available for
 * each slot in roster_positions. Fixed slots first (so a Bijan with elite value
 * can't accidentally be eaten by FLEX before being claimed by RB). Then FLEX
 * slots in order: more-restrictive flex (REC_FLEX, WRRB_FLEX) before generic
 * FLEX, then SUPER_FLEX last (it has the broadest pool and should pick from
 * scraps after fixed and standard flex are filled).
 */
export function optimizeLineup(
  rosterPositions: readonly SleeperRosterPosition[],
  pool: readonly ValuedAsset[],
): OptimizerResult {
  const slots = rosterPositions
    .filter((p): p is StarterSlot => !NON_STARTING.has(p))
    .map((slot) => slot as StarterSlot);

  const sortedPool = [...pool].sort((a, b) => b.value - a.value);
  const usedIds = new Set<string>();
  const starters: StarterAssignment[] = [];
  const slotCounts = new Map<StarterSlot, number>();

  function takeBest(eligible: (a: ValuedAsset) => boolean): ValuedAsset | null {
    for (const asset of sortedPool) {
      if (usedIds.has(asset.assetId)) continue;
      if (!eligible(asset)) continue;
      usedIds.add(asset.assetId);
      return asset;
    }
    return null;
  }

  // Pass 1: fixed positions (QB/RB/WR/TE/K/DEF) — claim premium players first.
  for (const slot of slots) {
    if (!FIXED_POSITIONS.has(slot)) continue;
    const found = takeBest((a) => a.position === slot);
    const idx = slotCounts.get(slot) ?? 0;
    slotCounts.set(slot, idx + 1);
    if (found) starters.push({ asset: found, slot, slotIndex: idx });
  }

  // Pass 2: restrictive flex (REC_FLEX, WRRB_FLEX) before generic FLEX.
  // Pass 3: generic FLEX.
  // Pass 4: SUPER_FLEX (always last — can pull from QB/RB/WR/TE).
  const FLEX_ORDER: Array<"REC_FLEX" | "WRRB_FLEX" | "FLEX" | "SUPER_FLEX"> = [
    "REC_FLEX",
    "WRRB_FLEX",
    "FLEX",
    "SUPER_FLEX",
  ];
  for (const flexType of FLEX_ORDER) {
    for (const slot of slots) {
      if (slot !== flexType) continue;
      const eligible = FLEX_ELIGIBLE[flexType];
      const found = takeBest((a) => eligible.has(a.position));
      const idx = slotCounts.get(slot) ?? 0;
      slotCounts.set(slot, idx + 1);
      if (found) starters.push({ asset: found, slot, slotIndex: idx });
    }
  }

  // Re-order starters to match the original roster_positions order so the UI
  // renders QB → RB → RB → WR → ... → FLEX → ... → K → DEF naturally.
  const slotOrderIndex = new Map<string, number>();
  let order = 0;
  for (const slot of slots) {
    const idx = slotOrderIndex.get(`${slot}-count`) ?? 0;
    slotOrderIndex.set(`${slot}-${idx}`, order);
    slotOrderIndex.set(`${slot}-count`, idx + 1);
    order += 1;
  }
  starters.sort((a, b) => {
    const ai = slotOrderIndex.get(`${a.slot}-${a.slotIndex}`) ?? 999;
    const bi = slotOrderIndex.get(`${b.slot}-${b.slotIndex}`) ?? 999;
    return ai - bi;
  });

  const remainingIds = new Set<string>();
  for (const asset of pool) {
    if (!usedIds.has(asset.assetId)) remainingIds.add(asset.assetId);
  }

  return { starters, remainingIds };
}
