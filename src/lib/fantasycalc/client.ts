import type { SleeperLeague } from "@/lib/sleeper/types";
import type { FantasyCalcEntry, FantasyCalcParams } from "./types";

const BASE = "https://api.fantasycalc.com/values/current";

export class FantasyCalcApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    message: string,
  ) {
    super(message);
    this.name = "FantasyCalcApiError";
  }
}

export function deriveParamsFromLeague(
  league: SleeperLeague,
  isDynasty: boolean,
): FantasyCalcParams {
  const numQbs: 1 | 2 = league.roster_positions.includes("SUPER_FLEX") ? 2 : 1;
  const ppr = league.scoring_settings.rec ?? 0;
  return {
    isDynasty,
    numQbs,
    numTeams: league.total_rosters,
    ppr,
  };
}

function buildUrl(params: FantasyCalcParams): string {
  const q = new URLSearchParams({
    isDynasty: String(params.isDynasty),
    numQbs: String(params.numQbs),
    numTeams: String(params.numTeams),
    ppr: String(params.ppr),
  });
  return `${BASE}?${q.toString()}`;
}

export async function fetchValues(
  params: FantasyCalcParams,
  opts: { signal?: AbortSignal } = {},
): Promise<FantasyCalcEntry[]> {
  const url = buildUrl(params);
  const init: RequestInit = { headers: { accept: "application/json" } };
  if (opts.signal) init.signal = opts.signal;
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new FantasyCalcApiError(
      res.status,
      url,
      `FantasyCalc ${res.status} ${res.statusText}`,
    );
  }
  return (await res.json()) as FantasyCalcEntry[];
}

/**
 * TEP correction multiplier. FantasyCalc's API does not accept a TEP param,
 * so when a league has bonus_rec_te > 0 we approximate with this multiplier
 * applied to TE values post-fetch. Per ARCHITECTURE.md §6.
 */
export function tepMultiplier(bonusRecTe: number): number {
  if (!Number.isFinite(bonusRecTe) || bonusRecTe <= 0) return 1;
  return 1 + bonusRecTe * 0.5;
}
