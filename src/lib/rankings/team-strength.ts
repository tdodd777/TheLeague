/**
 * Team strength profile — the per-position read that sits behind the team
 * overview card on a manager profile.
 *
 * The dynasty ranking already answers "how good is this roster overall". This
 * module answers the follow-up: *where* does that come from. It slices a
 * roster into the groups a manager actually thinks in (the starting slots,
 * the depth behind them, the pick warchest) and ranks each slice against the
 * other eleven teams, so a bar chart can show a team that is 1st at QB and
 * 11th at running back rather than a single composite number.
 *
 * Values are whatever the caller's breakdown carries, raw and unweighted: the
 * FantasyCalc numbers for the dynasty and season views, Sleeper projected
 * points for the week view. The tier multipliers in RANKINGS.md §6 exist to
 * make *totals* comparable; inside a single group they would only scale every
 * roster by the same constant and change no ranking.
 *
 * K and DEF are deliberately absent: FantasyCalc prices neither, so a K row
 * would rank twelve identical zeroes.
 */

import type { StarterSlot } from "./types";

/**
 * The slice of a roster this module ranks on. `RosterValueBreakdown` satisfies
 * it structurally, so the FantasyCalc-valued dynasty and season breakdowns
 * pass straight through; the week view builds one from projected points.
 */
export interface StrengthSource {
  rosterId: number;
  /** What the overall rank and score are computed from. */
  total: number;
  starters: ReadonlyArray<{ slot: StarterSlot; asset: { value: number } }>;
  bench: ReadonlyArray<{ value: number }>;
  reserve: ReadonlyArray<{ value: number }>;
  taxi: ReadonlyArray<{ value: number }>;
  picks: ReadonlyArray<{ value: number }>;
}

export type StrengthGroupKey =
  | "QB"
  | "RB"
  | "WR"
  | "TE"
  | "FLEX"
  | "DEPTH"
  | "PICKS";

/** Display order, top to bottom, in the overview card. */
export const STRENGTH_GROUP_ORDER: readonly StrengthGroupKey[] = [
  "QB",
  "RB",
  "WR",
  "TE",
  "FLEX",
  "DEPTH",
  "PICKS",
];

const GROUP_LABEL: Record<StrengthGroupKey, string> = {
  QB: "QB",
  RB: "RB",
  WR: "WR",
  TE: "TE",
  FLEX: "FLEX",
  DEPTH: "DEPTH",
  PICKS: "PICKS",
};

const GROUP_DESCRIPTION: Record<StrengthGroupKey, string> = {
  QB: "starting quarterback",
  RB: "starting running backs",
  WR: "starting receivers",
  TE: "starting tight end",
  FLEX: "flex starters",
  DEPTH: "everyone off the field: bench, IR, taxi",
  PICKS: "rookie pick portfolio",
};

const FLEX_SLOTS: ReadonlySet<StarterSlot> = new Set<StarterSlot>([
  "FLEX",
  "REC_FLEX",
  "WRRB_FLEX",
  "SUPER_FLEX",
]);

/** Which group a starting slot feeds. Null for slots the snapshot cannot price. */
function groupForSlot(slot: StarterSlot): StrengthGroupKey | null {
  if (slot === "QB" || slot === "RB" || slot === "WR" || slot === "TE") {
    return slot;
  }
  if (FLEX_SLOTS.has(slot)) return "FLEX";
  return null; // K, DEF
}

export interface GroupStrength {
  key: StrengthGroupKey;
  /** Short label for the bar row. */
  label: string;
  /** Plain-language expansion, used for the row's title/aria text. */
  description: string;
  /** Raw group value for this roster. */
  value: number;
  /** 1-based rank among rosters. Ties share the better rank. */
  rank: number;
  /** Highest group value in the league. */
  leagueBest: number;
  /** Lowest group value in the league. */
  leagueWorst: number;
  /**
   * Where this roster sits between the league's thinnest and deepest group,
   * 0..1. Bar length. Min-max rather than value/leagueBest because dynasty
   * values are compressed: dividing by the best would draw a 5th-place group
   * at 92% of a 1st-place one and the chart would say nothing.
   */
  share: number;
}

export interface TeamStrength {
  rosterId: number;
  /** 1-based rank by total roster value. Ties share the better rank. */
  overallRank: number;
  /** How many rosters this was ranked against. */
  teamCount: number;
  /** total / league best × 100, rounded. The top roster always scores 100. */
  score: number;
  /** Groups in STRENGTH_GROUP_ORDER, minus any the league prices at zero. */
  groups: GroupStrength[];
}

/** Sum a roster's raw value for one group. */
function groupValue(
  breakdown: StrengthSource,
  key: StrengthGroupKey,
): number {
  if (key === "PICKS") {
    return breakdown.picks.reduce((sum, p) => sum + p.value, 0);
  }
  if (key === "DEPTH") {
    return [...breakdown.bench, ...breakdown.reserve, ...breakdown.taxi].reduce(
      (sum, a) => sum + a.value,
      0,
    );
  }
  return breakdown.starters
    .filter((s) => groupForSlot(s.slot) === key)
    .reduce((sum, s) => sum + s.asset.value, 0);
}

/**
 * Standard competition ranking: sorted descending, equal values share the
 * better rank (1, 2, 2, 4). Returns rosterId → rank.
 */
function rankByValue(values: ReadonlyMap<number, number>): Map<number, number> {
  const sorted = [...values.entries()].sort((a, b) => b[1] - a[1]);
  const ranks = new Map<number, number>();
  let previousValue: number | null = null;
  let previousRank = 0;
  sorted.forEach(([rosterId, value], index) => {
    const rank = previousValue !== null && value === previousValue
      ? previousRank
      : index + 1;
    ranks.set(rosterId, rank);
    previousValue = value;
    previousRank = rank;
  });
  return ranks;
}

/**
 * Build one strength profile per roster. Pass the full league — every rank in
 * the result is relative to the rosters handed in.
 */
export function buildTeamStrengths(
  breakdowns: readonly StrengthSource[],
): Map<number, TeamStrength> {
  const result = new Map<number, TeamStrength>();
  if (breakdowns.length === 0) return result;

  const totals = new Map(breakdowns.map((b) => [b.rosterId, b.total]));
  const overallRanks = rankByValue(totals);
  const bestTotal = Math.max(...totals.values());

  // Per group: every roster's value, its league best, and its ranking.
  const groupData = STRENGTH_GROUP_ORDER.map((key) => {
    const values = new Map(
      breakdowns.map((b) => [b.rosterId, groupValue(b, key)] as const),
    );
    return {
      key,
      values,
      leagueBest: Math.max(...values.values()),
      leagueWorst: Math.min(...values.values()),
      ranks: rankByValue(values),
    };
  }).filter((g) => g.leagueBest > 0); // drops PICKS in season mode

  for (const breakdown of breakdowns) {
    const { rosterId } = breakdown;
    const groups: GroupStrength[] = groupData.map((g) => {
      const value = g.values.get(rosterId) ?? 0;
      const spread = g.leagueBest - g.leagueWorst;
      return {
        key: g.key,
        label: GROUP_LABEL[g.key],
        description: GROUP_DESCRIPTION[g.key],
        value,
        rank: g.ranks.get(rosterId) ?? breakdowns.length,
        leagueBest: g.leagueBest,
        leagueWorst: g.leagueWorst,
        // A league dead even at a position gives every roster a full bar; the
        // ordinals beside them are all 1st, which is the truth.
        share: spread > 0 ? (value - g.leagueWorst) / spread : 1,
      };
    });

    result.set(rosterId, {
      rosterId,
      overallRank: overallRanks.get(rosterId) ?? breakdowns.length,
      teamCount: breakdowns.length,
      score:
        bestTotal > 0 ? Math.round((breakdown.total / bestTotal) * 100) : 0,
      groups,
    });
  }

  return result;
}

/** "st" / "nd" / "rd" / "th" for a rank. Handles the 11/12/13 exceptions. */
export function ordinalSuffix(n: number): string {
  const abs = Math.abs(Math.trunc(n));
  const lastTwo = abs % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return "th";
  switch (abs % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

/** 1 → "1st", 12 → "12th". */
export function ordinal(n: number): string {
  return `${n}${ordinalSuffix(n)}`;
}
