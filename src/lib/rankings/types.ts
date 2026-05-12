import type { FantasyCalcEntry, FantasyCalcParams, PickIdentity } from "@/lib/fantasycalc";
import type { Manager } from "@/lib/types";

export type RankingMode = "dynasty" | "season";

export type StarterSlot =
  | "QB"
  | "RB"
  | "WR"
  | "TE"
  | "K"
  | "DEF"
  | "FLEX"
  | "REC_FLEX"
  | "WRRB_FLEX"
  | "SUPER_FLEX";

export type RosterTier = "starter" | "bench" | "reserve" | "taxi";

export interface ValueSnapshot {
  fetched_at: string;
  league_id: string;
  params: { dynasty: FantasyCalcParams; redraft: FantasyCalcParams };
  dynasty: FantasyCalcEntry[];
  redraft: FantasyCalcEntry[];
}

/** A player or pick on a roster, with its valuation pulled from the snapshot. */
export interface ValuedAsset {
  /** Sleeper player_id (e.g. "9509") or "PICK:<season>-<round>-<slot>". */
  assetId: string;
  /** Display label. */
  name: string;
  /** "QB"/"RB"/... or "PICK". */
  position: string;
  team: string | null;
  age: number | null;
  /** Fantasy value in this snapshot mode (dynasty or redraft). */
  value: number;
  trend30Day: number;
  overallRank: number | null;
  positionRank: number | null;
  /** True if the player is rostered but missing from the FantasyCalc snapshot. Value is 0. */
  missing: boolean;
  /** For picks only: which league season the pick is for. */
  pickSeason?: number;
  /** For picks only: round (1-3 in our league). */
  pickRound?: number;
  /** For picks only: assigned slot (real if known, mid-round default for future years). */
  pickSlot?: number;
  /** For picks only: did we use a slot-specific value or fall back to round-only? */
  pickSource?: "exact_slot" | "round_fallback" | "missing" | "drafted_player";
  /** For picks whose draft already occurred: the player drafted at that slot. */
  becamePlayer?: {
    playerId: string;
    name: string;
    position: string;
    pickNo: number;
    draftSlot: number;
  };
}

/** A starter, with which slot it occupies in the lineup. */
export interface StarterAssignment {
  asset: ValuedAsset;
  slot: StarterSlot;
  /** Index of this slot among same-name slots (0-based). E.g. RB1 → 0, RB2 → 1. */
  slotIndex: number;
}

export interface RosterValueBreakdown {
  rosterId: number;
  manager: Manager;
  /** The mode this breakdown was computed in. */
  mode: RankingMode;

  starterValue: number;
  benchValue: number;
  reserveValue: number;
  taxiValue: number;
  pickValue: number;
  studBonus: number;
  total: number;

  /** Sum of *unweighted* values by position across the entire roster, for the position-breakdown bar chart. */
  byPosition: Record<string, number>;

  starters: StarterAssignment[];
  bench: ValuedAsset[];
  reserve: ValuedAsset[];
  taxi: ValuedAsset[];
  picks: ValuedAsset[];

  /** Average age of starters with a known age. Null if no starter has age data. */
  starterAvgAge: number | null;
  /** Average age across all rostered players (excluding picks) with a known age. */
  rosterAvgAge: number | null;

  /** Sum of trend30Day across starters. Useful for the quadrant bubble color. */
  trend30Day: number;
}

export interface SeasonPowerBreakdown {
  rosterId: number;
  manager: Manager;
  /** Roster value breakdown computed in season (redraft) mode. */
  seasonValue: RosterValueBreakdown;

  /** From the redraft-mode breakdown. */
  optimalStarterValue: number;
  /** Indexed: 1.0 = league mean. */
  ppgIndex: number;
  /** Indexed: 1.0 = league mean. */
  last3Index: number;
  /** 0..1. */
  allPlayPct: number;
  allPlayWins: number;
  allPlayLosses: number;
  actualWins: number;
  actualLosses: number;
  actualTies: number;
  /** Real games played in this season's standings. */
  gamesPlayed: number;
  /** allPlayPct × games — what your record would have been with average luck. */
  expectedWins: number;
  /** actualWins - expectedWins. Positive = lucky schedule. */
  scheduleLuck: number;
  /** Per-week PF / league weekly mean — hovers around 1.0. */
  weeklyPower: number[];
  /** points_for / total potential points (Sleeper's PP). 1.0 = perfect lineups all year. */
  lineupIQ: number | null;

  /** Composite season_power score. */
  total: number;
}

export interface RankingResult {
  mode: RankingMode;
  season: string;
  snapshotDate: string;
  rosters: RosterValueBreakdown[];
  /** Averages across all rosters (raw, not weighted). */
  leagueAverages: {
    total: number;
    starterValue: number;
    benchValue: number;
    pickValue: number;
    studBonus: number;
  };
}

/** Identity helpers — re-exported for callers that want to avoid an extra import. */
export type { PickIdentity };
