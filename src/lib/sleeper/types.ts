export type SleeperLeagueStatus =
  | "pre_draft"
  | "drafting"
  | "in_season"
  | "complete";

export type SleeperLeagueType = 0 | 1 | 2;

export type SleeperRosterPosition =
  | "QB"
  | "RB"
  | "WR"
  | "TE"
  | "FLEX"
  | "REC_FLEX"
  | "WRRB_FLEX"
  | "SUPER_FLEX"
  | "K"
  | "DEF"
  | "DL"
  | "LB"
  | "DB"
  | "IDP_FLEX"
  | "BN"
  | "IR"
  | "TAXI";

export interface SleeperLeagueSettings {
  num_teams: number;
  playoff_teams: number;
  playoff_week_start: number;
  draft_rounds: number;
  taxi_slots: number;
  taxi_years: number;
  reserve_slots: number;
  trade_deadline: number;
  start_week: number;
  type: SleeperLeagueType;
  pick_trading: number;
  best_ball: number;
  waiver_budget: number;
  max_keepers: number;
  leg: number;
}

export interface SleeperScoringSettings {
  rec: number;
  bonus_rec_te: number;
  pass_td: number;
  pass_yd: number;
  pass_int: number;
  pass_2pt: number;
  rush_yd: number;
  rush_td: number;
  rush_2pt: number;
  rec_yd: number;
  rec_td: number;
  rec_2pt: number;
  fum_lost: number;
  [key: string]: number;
}

export interface SleeperLeague {
  league_id: string;
  previous_league_id: string | null;
  draft_id: string | null;
  name: string;
  season: string;
  season_type: string;
  sport: string;
  status: SleeperLeagueStatus;
  total_rosters: number;
  roster_positions: SleeperRosterPosition[];
  scoring_settings: SleeperScoringSettings;
  settings: SleeperLeagueSettings;
  avatar: string | null;
}

export interface SleeperUser {
  user_id: string;
  league_id: string;
  display_name: string;
  avatar: string | null;
  is_owner: boolean;
  is_bot: boolean;
  metadata: SleeperUserMetadata | null;
}

export interface SleeperUserMetadata {
  team_name?: string;
  avatar?: string;
  mention_pn?: "on" | "off";
  allow_pn?: "on" | "off";
  allow_sms?: "on" | "off";
  archived?: "on" | "off";
  [key: string]: string | undefined;
}

export interface SleeperRosterSettings {
  wins: number;
  losses: number;
  ties: number;
  fpts: number;
  fpts_decimal?: number;
  fpts_against?: number;
  fpts_against_decimal?: number;
  ppts?: number;
  ppts_decimal?: number;
  waiver_budget_used: number;
  waiver_position: number;
  total_moves: number;
  division?: number;
}

export interface SleeperRoster {
  league_id: string;
  roster_id: number;
  owner_id: string | null;
  co_owners: string[] | null;
  players: string[] | null;
  starters: string[] | null;
  reserve: string[] | null;
  taxi: string[] | null;
  keepers: string[] | null;
  player_map: Record<string, string> | null;
  metadata: Record<string, string> | null;
  settings: SleeperRosterSettings;
}

export interface SleeperMatchup {
  matchup_id: number;
  roster_id: number;
  points: number;
  starters: string[];
  starters_points: number[];
  players: string[];
  players_points: Record<string, number>;
  custom_points: number | null;
  player_pool?: unknown;
}

export type SleeperTransactionType =
  | "trade"
  | "waiver"
  | "free_agent"
  | "commissioner";

export type SleeperTransactionStatus = "complete" | "failed" | "processing";

export interface SleeperTransactionDraftPick {
  season: string;
  round: number;
  roster_id: number;
  owner_id: number;
  previous_owner_id: number;
}

export interface SleeperWaiverBudgetMove {
  sender: number;
  receiver: number;
  amount: number;
}

export interface SleeperTransaction {
  transaction_id: string;
  type: SleeperTransactionType;
  status: SleeperTransactionStatus;
  status_updated: number;
  created: number;
  creator: string | null;
  leg: number;
  roster_ids: number[];
  consenter_ids: number[] | null;
  adds: Record<string, number> | null;
  drops: Record<string, number> | null;
  draft_picks: SleeperTransactionDraftPick[];
  waiver_budget: SleeperWaiverBudgetMove[];
  metadata: Record<string, unknown> | null;
  settings: Record<string, number> | null;
}

export interface SleeperTradedPick {
  season: string;
  round: number;
  roster_id: number;
  owner_id: number;
  previous_owner_id: number;
}

export interface SleeperDraft {
  draft_id: string;
  league_id: string;
  season: string;
  season_type: string;
  status: "pre_draft" | "drafting" | "complete" | "paused";
  type: "snake" | "linear" | "auction";
  start_time: number | null;
  last_picked: number | null;
  draft_order: Record<string, number> | null;
  slot_to_roster_id?: Record<string, number>;
  metadata: {
    description?: string;
    name?: string;
    scoring_type?: string;
    [key: string]: string | undefined;
  };
  settings: {
    rounds: number;
    teams: number;
    pick_timer: number;
    [key: string]: number;
  };
}

export interface SleeperDraftPick {
  draft_id: string;
  pick_no: number;
  round: number;
  draft_slot: number;
  roster_id: number;
  picked_by: string;
  player_id: string;
  is_keeper: boolean | null;
  metadata: Record<string, string> | null;
}

/**
 * One bracket matchup in either /winners_bracket or /losers_bracket. Sleeper
 * publishes the full bracket as a flat array of matchups; t1/t2 may be a
 * roster_id (fixed seed) or a `{w|l: matchup_id}` reference to the winner /
 * loser of an earlier round.
 */
export interface SleeperBracketMatchup {
  /** 1-indexed round, increasing toward the final. */
  r: number;
  /** Matchup id within the bracket. */
  m: number;
  /** Roster id seeded into slot 1 (null until the prior round resolves). */
  t1?: number | null;
  /** Roster id seeded into slot 2 (null until the prior round resolves). */
  t2?: number | null;
  /** roster_id of the winner; null until the matchup is played. */
  w?: number | null;
  /** roster_id of the loser; null until the matchup is played. */
  l?: number | null;
  /** When t1 came from a previous matchup result. */
  t1_from?: { w?: number; l?: number };
  /** When t2 came from a previous matchup result. */
  t2_from?: { w?: number; l?: number };
  /** Final placement (e.g. 1 for championship-winning matchup). */
  p?: number | null;
}

export interface SleeperNflState {
  week: number;
  display_week: number;
  leg: number;
  season: string;
  season_type: "pre" | "regular" | "post" | "off";
  league_season: string;
  league_create_season: string;
  previous_season: string;
  season_start_date: string | null;
  season_has_scores: boolean;
}

export interface SleeperPlayer {
  player_id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  position: string | null;
  fantasy_positions: string[] | null;
  team: string | null;
  age: number | null;
  years_exp: number | null;
  status: string | null;
  injury_status: string | null;
  birth_date: string | null;
  height: string | null;
  weight: string | null;
  college: string | null;
  number: number | null;
  search_full_name: string | null;
  search_first_name: string | null;
  search_last_name: string | null;
}
