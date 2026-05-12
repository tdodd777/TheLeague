export type FantasyCalcPosition = "QB" | "RB" | "WR" | "TE" | "PICK";

export interface FantasyCalcPlayer {
  id: number;
  name: string;
  position: FantasyCalcPosition;
  sleeperId: string | null;
  mflId: string | null;
  espnId: string | null;
  fleaflickerId: string | null;
  ffpcId: string | null;
  maybeAge: number | null;
  maybeYoe: number | null;
  maybeBirthday: string | null;
  maybeHeight: string | null;
  maybeWeight: number | null;
  maybeCollege: string | null;
  maybeTeam: string | null;
}

export interface FantasyCalcEntry {
  player: FantasyCalcPlayer;
  value: number;
  overallRank: number;
  positionRank: number;
  trend30Day: number;
  redraftValue: number;
  combinedValue: number;
  redraftDynastyValueDifference: number | null;
  redraftDynastyValuePercDifference: number | null;
  maybeMovingStandardDeviation: number | null;
  maybeMovingStandardDeviationPerc: number | null;
  maybeMovingStandardDeviationAdjusted: number | null;
  displayTrend: boolean;
  maybeOwner: string | null;
  starter: boolean;
  maybeTier: number | null;
  maybeAdp: number | null;
  maybeTradeFrequency: number | null;
}

export interface FantasyCalcParams {
  isDynasty: boolean;
  numQbs: 1 | 2;
  numTeams: number;
  ppr: number;
}

/**
 * Identity of a draft pick as named by FantasyCalc.
 *
 * FantasyCalc uses two name formats:
 *   - "YYYY Pick R.PP" - exact slot, used for the upcoming-rookie-draft year
 *     (e.g. "2026 Pick 1.04"). slot is 1-12+.
 *   - "YYYY Nth"      - round only, used for years 2+ from the current draft
 *     (e.g. "2027 1st"). slot is null.
 *
 * No Early/Mid/Late tiering exists in the live API — future-year picks
 * resolve by round only. See ARCHITECTURE.md §6.
 */
export interface PickIdentity {
  season: number;
  round: number;
  slot: number | null;
}
