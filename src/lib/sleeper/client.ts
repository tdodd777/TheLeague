import type {
  SleeperBracketMatchup,
  SleeperDraft,
  SleeperDraftPick,
  SleeperLeague,
  SleeperMatchup,
  SleeperNflState,
  SleeperPlayer,
  SleeperRoster,
  SleeperTradedPick,
  SleeperTransaction,
  SleeperUser,
} from "./types";

const BASE = "https://api.sleeper.app/v1";

export class SleeperApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    message: string,
  ) {
    super(message);
    this.name = "SleeperApiError";
  }
}

interface FetchOptions {
  signal?: AbortSignal;
}

async function getJson<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  const url = `${BASE}${path}`;
  const init: RequestInit = { headers: { accept: "application/json" } };
  if (opts.signal) init.signal = opts.signal;
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new SleeperApiError(
      res.status,
      url,
      `Sleeper ${res.status} ${res.statusText} on ${path}`,
    );
  }
  return (await res.json()) as T;
}

export const sleeper = {
  league: (leagueId: string, opts?: FetchOptions): Promise<SleeperLeague> =>
    getJson(`/league/${leagueId}`, opts),

  users: (leagueId: string, opts?: FetchOptions): Promise<SleeperUser[]> =>
    getJson(`/league/${leagueId}/users`, opts),

  rosters: (leagueId: string, opts?: FetchOptions): Promise<SleeperRoster[]> =>
    getJson(`/league/${leagueId}/rosters`, opts),

  matchups: (
    leagueId: string,
    week: number,
    opts?: FetchOptions,
  ): Promise<SleeperMatchup[]> =>
    getJson(`/league/${leagueId}/matchups/${week}`, opts),

  transactions: (
    leagueId: string,
    week: number,
    opts?: FetchOptions,
  ): Promise<SleeperTransaction[]> =>
    getJson(`/league/${leagueId}/transactions/${week}`, opts),

  tradedPicks: (
    leagueId: string,
    opts?: FetchOptions,
  ): Promise<SleeperTradedPick[]> =>
    getJson(`/league/${leagueId}/traded_picks`, opts),

  winnersBracket: (
    leagueId: string,
    opts?: FetchOptions,
  ): Promise<SleeperBracketMatchup[]> =>
    getJson(`/league/${leagueId}/winners_bracket`, opts),

  losersBracket: (
    leagueId: string,
    opts?: FetchOptions,
  ): Promise<SleeperBracketMatchup[]> =>
    getJson(`/league/${leagueId}/losers_bracket`, opts),

  drafts: (leagueId: string, opts?: FetchOptions): Promise<SleeperDraft[]> =>
    getJson(`/league/${leagueId}/drafts`, opts),

  draft: (draftId: string, opts?: FetchOptions): Promise<SleeperDraft> =>
    getJson(`/draft/${draftId}`, opts),

  draftPicks: (
    draftId: string,
    opts?: FetchOptions,
  ): Promise<SleeperDraftPick[]> => getJson(`/draft/${draftId}/picks`, opts),

  draftTradedPicks: (
    draftId: string,
    opts?: FetchOptions,
  ): Promise<SleeperTradedPick[]> =>
    getJson(`/draft/${draftId}/traded_picks`, opts),

  nflState: (opts?: FetchOptions): Promise<SleeperNflState> =>
    getJson(`/state/nfl`, opts),

  players: (opts?: FetchOptions): Promise<Record<string, SleeperPlayer>> =>
    getJson(`/players/nfl`, opts),

  /**
   * Per-player weekly projections. Sleeper returns a `Record<player_id, stat_block>`
   * with `pts_ppr`, `pts_half_ppr`, `pts_std`, plus the underlying stat
   * projections. The full payload is ~500 KB per week — callers are expected
   * to slim it before persisting.
   */
  projections: (
    season: string,
    week: number,
    opts?: FetchOptions,
  ): Promise<Record<string, Record<string, number>>> => {
    const positions = ["QB", "RB", "WR", "TE", "K", "DEF"];
    const q = positions.map((p) => `position[]=${p}`).join("&");
    return getJson(
      `/projections/nfl/regular/${season}/${week}?${q}&season_type=regular`,
      opts,
    );
  },
};
