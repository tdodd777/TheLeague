/**
 * Tunable constants for the rankings engine. Adjust here, never inline at
 * call sites — this module is the single source of truth for the heuristics
 * called out in RANKINGS.md §6 and §11.
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

/**
 * Season power composite weights (sum to 100). Each weight applies to a
 * league-relative index centred on 1.0, so a weight is the share of the score
 * that component actually controls. RANKINGS.md §7.
 */
export const SEASON_POWER_WEIGHTS = {
  optimalStarterValue: 40,
  ppgIndex: 30,
  last3: 20,
  allPlay: 10,
} as const;

/** Number of trailing weeks for the "last3" form component. */
export const LAST_N_WEEKS = 3;

/**
 * Off-season trend suppression: months (1-12) where 30-day trends are
 * unreliable (low trade volume amplifies noise — RANKINGS.md §11.6).
 * 4-7 = April through July inclusive.
 */
export const OFF_SEASON_SUPPRESSION_MONTHS = new Set([4, 5, 6, 7]);

export function isTrendSuppressed(month: number): boolean {
  return OFF_SEASON_SUPPRESSION_MONTHS.has(month);
}
