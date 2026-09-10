import type {
  SleeperLeague,
  SleeperPlayer,
  SleeperRoster,
  SleeperUser,
} from "./sleeper";

export interface Manager {
  userId: string;
  rosterId: number;
  username: string;
  displayName: string;
  teamName: string | null;
  avatar: string | null;
  avatarUrl: string;
}

export interface SeasonStanding {
  rosterId: number;
  manager: Manager;
  wins: number;
  losses: number;
  ties: number;
  pf: number;
  pa: number;
  ppts: number;
  streak: string | null;
  record: string | null;
  division: number | null;
}

export interface SeasonRoster {
  season: string;
  leagueId: string;
  manager: Manager;
  starters: string[];
  bench: string[];
  reserve: string[];
  taxi: string[];
  allPlayers: string[];
}

export interface ManagerCareerStats {
  manager: Manager;
  seasons: Array<{
    season: string;
    wins: number;
    losses: number;
    ties: number;
    pf: number;
    pa: number;
    /** Potential points (Sleeper's ppts) for the season — best-possible lineup output. */
    ppts: number;
    finishRank: number | null;
  }>;
  totals: {
    wins: number;
    losses: number;
    ties: number;
    pf: number;
    pa: number;
    ppts: number;
  };
}

export type SleeperLikeRoster = SleeperRoster;
export type SleeperLikeUser = SleeperUser;
export type SleeperLikeLeague = SleeperLeague;
export type SleeperLikePlayer = SleeperPlayer;
