import path from "node:path";
import { readFile } from "node:fs/promises";

import type { SleeperBracketMatchup } from "@/lib/sleeper";

import { readLeague } from "./cache";
import { seasonDir } from "./paths";

async function readJsonOrNull<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (err) {
    if (
      err instanceof Error &&
      "code" in err &&
      (err as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return null;
    }
    throw err;
  }
}

export async function readWinnersBracket(
  season: string,
): Promise<SleeperBracketMatchup[] | null> {
  return readJsonOrNull<SleeperBracketMatchup[]>(
    path.join(seasonDir(season), "winners_bracket.json"),
  );
}

export async function readLosersBracket(
  season: string,
): Promise<SleeperBracketMatchup[] | null> {
  return readJsonOrNull<SleeperBracketMatchup[]>(
    path.join(seasonDir(season), "losers_bracket.json"),
  );
}

/**
 * Final placements for a season, derived from the bracket `p` field.
 *
 * Sleeper encodes a placement game with `p` set to the winner's final rank
 * (e.g. p=1 → championship, p=5 → 5th-place game). The loser of that matchup
 * gets `p + 1`. The winners_bracket gives placements 1–N (where N is roughly
 * playoff_teams), and the losers_bracket gives placements N+1 onward.
 *
 * Result is keyed by roster_id; only rosters that landed in a placement game
 * appear, but for completed seasons that's everyone.
 */
export interface SeasonPlacements {
  byRosterId: Map<number, number>;
  /** Convenience lists. */
  champion: number | null;
  runnerUp: number | null;
  third: number | null;
  toiletBowlChamp: number | null;
}

function applyBracket(
  out: Map<number, number>,
  bracket: SleeperBracketMatchup[] | null,
  /** Offset added to each `p` — 0 for winners_bracket, playoff_teams for losers. */
  placementOffset: number,
): void {
  if (!bracket) return;
  // Sleeper convention: `p` is the placement the matchup decides — winner
  // finishes Pth, loser finishes (P+1)th. The losers_bracket re-numbers `p`
  // starting at 1 within itself, so it needs an offset to translate to real
  // standings (e.g. losers p=1 → 7th in a 12-team league with 6-team playoff).
  for (const m of bracket) {
    if (typeof m.p !== "number") continue;
    const winnerPlace = m.p + placementOffset;
    const loserPlace = winnerPlace + 1;
    if (typeof m.w === "number") out.set(m.w, winnerPlace);
    if (typeof m.l === "number") out.set(m.l, loserPlace);
  }
}

export async function getSeasonPlacements(
  season: string,
): Promise<SeasonPlacements> {
  const [winners, losers, league] = await Promise.all([
    readWinnersBracket(season),
    readLosersBracket(season),
    readLeague(season),
  ]);
  const playoffTeams = league.settings.playoff_teams || 6;

  const byRosterId = new Map<number, number>();
  applyBracket(byRosterId, winners, 0);
  applyBracket(byRosterId, losers, playoffTeams);

  let champion: number | null = null;
  let runnerUp: number | null = null;
  let third: number | null = null;
  let toiletBowlChamp: number | null = null;
  for (const [rosterId, place] of byRosterId) {
    if (place === 1) champion = rosterId;
    else if (place === 2) runnerUp = rosterId;
    else if (place === 3) third = rosterId;
  }
  // Toilet bowl champion = winner of the losers-bracket final, i.e. the best
  // finisher among non-playoff teams. With losers offset by playoff_teams,
  // that's place (playoff_teams + 1) — typically 7th in a 12-team / 6-team
  // playoff league.
  const toiletBowlPlace = playoffTeams + 1;
  for (const [rosterId, place] of byRosterId) {
    if (place === toiletBowlPlace) {
      toiletBowlChamp = rosterId;
      break;
    }
  }

  return { byRosterId, champion, runnerUp, third, toiletBowlChamp };
}
