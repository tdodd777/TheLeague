import type { FantasyCalcEntry, PickIdentity } from "./types";
import { formatPickName, parsePickName } from "./pick-name";

/**
 * Default slot for future-year picks where FantasyCalc only publishes a
 * single round-only value (e.g. "2027 1st"). 12-team league: slot 7 is the
 * mid-round position. Override per-pick via {@link resolvePickValue} once
 * trajectory-aware tiering exists.
 */
export const DEFAULT_FUTURE_PICK_SLOT = 7;

export interface PickValueIndex {
  /** Map from canonicalised key ("YYYY Pick R.PP") to FantasyCalc entry. */
  bySlot: Map<string, FantasyCalcEntry>;
  /** Round-only fallback ("YYYY R") to FantasyCalc entry, when API publishes one. */
  byRound: Map<string, FantasyCalcEntry>;
}

function roundKey(season: number, round: number): string {
  return `${season}-${round}`;
}

export function buildPickValueIndex(entries: FantasyCalcEntry[]): PickValueIndex {
  const bySlot = new Map<string, FantasyCalcEntry>();
  const byRound = new Map<string, FantasyCalcEntry>();
  for (const entry of entries) {
    if (entry.player.position !== "PICK") continue;
    const ident = parsePickName(entry.player.name);
    if (!ident) continue;
    if (ident.slot !== null) {
      bySlot.set(formatPickName(ident), entry);
    } else {
      byRound.set(roundKey(ident.season, ident.round), entry);
    }
  }
  return { bySlot, byRound };
}

export interface PickResolution {
  /** The exact-slot identity used for valuation. */
  identity: PickIdentity;
  value: number;
  /** Source of the value: a slot-specific entry, or a round-only fallback. */
  source: "exact_slot" | "round_fallback";
  entry: FantasyCalcEntry;
}

/**
 * Resolve a pick (with an exact slot — assigned by the caller) to a value.
 * The caller decides the slot: known draft order for current year, or a
 * default (slot 7 for 12-team) for future years.
 *
 * Returns null if the season/round is not in the snapshot at all.
 */
export function resolvePickValue(
  ident: PickIdentity,
  index: PickValueIndex,
): PickResolution | null {
  if (ident.slot === null) {
    throw new Error(
      `resolvePickValue requires an exact slot. Got round-only ${formatPickName(ident)}.`,
    );
  }
  const slotKey = formatPickName(ident);
  const slotEntry = index.bySlot.get(slotKey);
  if (slotEntry) {
    return {
      identity: ident,
      value: slotEntry.value,
      source: "exact_slot",
      entry: slotEntry,
    };
  }
  const roundEntry = index.byRound.get(roundKey(ident.season, ident.round));
  if (roundEntry) {
    return {
      identity: ident,
      value: roundEntry.value,
      source: "round_fallback",
      entry: roundEntry,
    };
  }
  return null;
}

/**
 * Assign an exact slot to a future-year pick using the league-wide default
 * (mid-round). Used when we don't yet know draft order.
 */
export function withDefaultSlot(
  ident: PickIdentity,
  defaultSlot: number = DEFAULT_FUTURE_PICK_SLOT,
): PickIdentity {
  if (ident.slot !== null) return ident;
  return { ...ident, slot: defaultSlot };
}
