/**
 * Tunable constants for the rankings engine. Adjust here, never inline at
 * call sites — this module is the single source of truth for the heuristics
 * called out in ARCHITECTURE.md §6.
 */

export const TIER_MULTIPLIERS = {
  starter: 1.0,
  bench: 0.5,
  reserve: 0.2,
  taxi: 0.4,
  pick: 1.0,
} as const;

/** How many of the highest-value non-starter, non-IR, non-taxi players get the bench multiplier. The rest fall to reserve. */
export const BENCH_TOP_N = 5;

/** Per-player kicker: max(0, value - STUD_THRESHOLD) * STUD_BONUS_RATE, summed over starters. */
export const STUD_THRESHOLD = 6000;
export const STUD_BONUS_RATE = 0.15;

/** Season power composite weights (sum to 100). */
export const SEASON_POWER_WEIGHTS = {
  optimalStarterValue: 40,
  ppgIndex: 30,
  last3: 20,
  allPlay: 10,
} as const;

/** Divisor for the value component — keeps it on the same scale as the index components. ARCHITECTURE.md §6 (season power formula). */
export const SEASON_POWER_VALUE_DIVISOR = 10000;

/** Number of trailing weeks for the "last3" form component. */
export const LAST_N_WEEKS = 3;

/**
 * Off-season trend suppression: months (1-12) where 30-day trends are
 * unreliable (low trade volume amplifies noise — see ARCHITECTURE.md §6 caveats).
 * 4-7 = April through July inclusive.
 */
export const OFF_SEASON_SUPPRESSION_MONTHS = new Set([4, 5, 6, 7]);

export function isTrendSuppressed(month: number): boolean {
  return OFF_SEASON_SUPPRESSION_MONTHS.has(month);
}
