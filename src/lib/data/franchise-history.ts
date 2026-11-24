import type { SleeperMatchup, SleeperTransaction } from "@/lib/sleeper";

import {
  listCachedSeasons,
  readAllTransactions,
  readMatchups,
  readRosters,
} from "./cache";
import { getManagers, type ManagerLookup } from "./managers";
import type { GamePhase } from "./records";
import { getWeekBounds, MAX_MATCHUP_WEEK } from "./weekly";

/**
 * Franchise history for one manager's team: who has scored the most for it,
 * who has stayed on it the longest, and its best single-player games.
 *
 * Everything here is credited to the manager, never to the roster slot. When a
 * team changes hands, the new manager starts from zero and the old manager
 * keeps every season they ran. That matches the career totals on the same
 * page, which are also keyed by Sleeper user ID.
 *
 * Scoring scope matches the record book: starter points only (bench points
 * never counted for anyone), every played week including playoff and
 * consolation games, and no week still in progress.
 */
export const FRANCHISE_HISTORY_SCOPE_NOTE =
  "Starter points only, including playoff and consolation games, counted for the seasons this manager ran the team. Weeks still in progress are not counted.";

/** One counted game for one team. */
export interface FranchiseGameInput {
  week: number;
  phase: GamePhase;
  matchup: Pick<
    SleeperMatchup,
    "starters" | "starters_points" | "players_points"
  >;
}

/** One season of one team, already narrowed to that team's roster. */
export interface FranchiseSeasonInput {
  season: string;
  /** Played games inside the record-book scope. */
  games: FranchiseGameInput[];
  /** Every player seen on the roster that season, weekly lineups plus the season snapshot. */
  rostered: ReadonlySet<string>;
}

export interface FranchiseScorerRow {
  playerId: string;
  points: number;
  starts: number;
  /** Seasons with at least one start, ascending. */
  seasons: string[];
}

export interface FranchiseTenureRow {
  playerId: string;
  /** Seasons on the roster, ascending. */
  seasons: string[];
  /** On the roster in the newest cached season. */
  current: boolean;
  /** Starter points for this team, used to order ties. */
  points: number;
}

export interface FranchiseGameRow {
  playerId: string;
  points: number;
  season: string;
  week: number;
  phase: GamePhase;
}

/** A team as it was named in one season, for labelling a trade partner. */
export interface FranchiseTeamRef {
  /** Manager page slug: the Sleeper display name. */
  username: string;
  /** Team name in the season of the move. */
  name: string;
}

/**
 * How a player came to or left this team, when another team was involved or
 * the player is gone. Current players only get a note when a trade brought
 * them in; former players get the move that took them off the roster.
 */
export interface FranchiseMoveNote {
  kind: "acquired" | "traded-away" | "dropped";
  /** The other team in a trade; null for drops. */
  team: FranchiseTeamRef | null;
  season: string;
  /** Sleeper's completion time, epoch milliseconds. */
  at: number;
}

/** One cached Sleeper transaction and the league season it belongs to. */
export interface FranchiseTransactionInput {
  season: string;
  tx: Pick<
    SleeperTransaction,
    "type" | "status" | "adds" | "drops" | "status_updated" | "created"
  >;
}

export interface FranchiseHistory {
  scorers: FranchiseScorerRow[];
  tenure: FranchiseTenureRow[];
  bestGames: FranchiseGameRow[];
  /** Trade and departure notes for the players on the scorer and tenure boards. */
  moves: ReadonlyMap<string, FranchiseMoveNote>;
  /** Seasons on the roster for every player ever rostered, keyed by player ID. */
  seasonsByPlayer: ReadonlyMap<string, number>;
  /** Seasons that contributed at least one counted game, ascending. */
  seasonsCounted: string[];
  /** Latest counted game, for the "through" label. */
  lastGame: { season: string; week: number } | null;
}

export interface FranchiseHistoryLimits {
  scorers: number;
  tenure: number;
  bestGames: number;
}

const DEFAULT_LIMITS: FranchiseHistoryLimits = {
  scorers: 10,
  tenure: 10,
  bestGames: 10,
};

/** Sleeper fills an empty lineup slot with "0". */
function isEmptySlot(playerId: string | undefined): boolean {
  return !playerId || playerId === "0";
}

/** Rounds to Sleeper's two-decimal scoring so float sums print cleanly. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Pure aggregation over one team's seasons. `currentPlayers` is the roster in
 * the newest season, used to flag who is still on the team.
 */
export function aggregateFranchiseHistory(
  seasons: readonly FranchiseSeasonInput[],
  currentPlayers: ReadonlySet<string>,
  limits: FranchiseHistoryLimits = DEFAULT_LIMITS,
): FranchiseHistory {
  const ordered = [...seasons].sort((a, b) =>
    a.season.localeCompare(b.season),
  );
  const scoring = new Map<
    string,
    { points: number; starts: number; seasons: Set<string> }
  >();
  const rosteredSeasons = new Map<string, Set<string>>();
  const games: FranchiseGameRow[] = [];
  const seasonsCounted: string[] = [];
  let lastGame: FranchiseHistory["lastGame"] = null;

  for (const s of ordered) {
    for (const playerId of s.rostered) {
      if (isEmptySlot(playerId)) continue;
      const set = rosteredSeasons.get(playerId) ?? new Set<string>();
      set.add(s.season);
      rosteredSeasons.set(playerId, set);
    }

    const weeks = [...s.games].sort((a, b) => a.week - b.week);
    if (weeks.length > 0) seasonsCounted.push(s.season);
    for (const game of weeks) {
      lastGame = { season: s.season, week: game.week };
      const {
        starters,
        starters_points: startersPoints,
        players_points: playersPoints,
      } = game.matchup;
      (starters ?? []).forEach((playerId, slot) => {
        if (isEmptySlot(playerId)) return;
        // The slot score is what counted toward the team total. Fall back to
        // the per-player map only when Sleeper left the slot score out.
        const points =
          startersPoints?.[slot] ?? playersPoints?.[playerId] ?? 0;
        const row = scoring.get(playerId) ?? {
          points: 0,
          starts: 0,
          seasons: new Set<string>(),
        };
        row.points += points;
        row.starts += 1;
        row.seasons.add(s.season);
        scoring.set(playerId, row);
        games.push({
          playerId,
          points: round2(points),
          season: s.season,
          week: game.week,
          phase: game.phase,
        });
        // A starter is on the roster that week even if the snapshot missed them.
        const set = rosteredSeasons.get(playerId) ?? new Set<string>();
        set.add(s.season);
        rosteredSeasons.set(playerId, set);
      });
    }
  }

  const scorers: FranchiseScorerRow[] = [...scoring.entries()]
    .map(([playerId, row]) => ({
      playerId,
      points: round2(row.points),
      starts: row.starts,
      seasons: [...row.seasons].sort(),
    }))
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.starts - a.starts ||
        a.playerId.localeCompare(b.playerId),
    );

  const tenure: FranchiseTenureRow[] = [...rosteredSeasons.entries()]
    .map(([playerId, set]) => ({
      playerId,
      seasons: [...set].sort(),
      current: currentPlayers.has(playerId),
      points: round2(scoring.get(playerId)?.points ?? 0),
    }))
    .sort(
      (a, b) =>
        b.seasons.length - a.seasons.length ||
        Number(b.current) - Number(a.current) ||
        b.points - a.points ||
        a.playerId.localeCompare(b.playerId),
    );

  const bestGames = games
    .sort(
      (a, b) =>
        b.points - a.points ||
        a.season.localeCompare(b.season) ||
        a.week - b.week ||
        a.playerId.localeCompare(b.playerId),
    )
    .slice(0, limits.bestGames);

  return {
    scorers: scorers.slice(0, limits.scorers),
    tenure: tenure.slice(0, limits.tenure),
    bestGames,
    moves: new Map(),
    seasonsByPlayer: new Map(
      [...rosteredSeasons.entries()].map(([id, set]) => [id, set.size]),
    ),
    seasonsCounted,
    lastGame,
  };
}

/**
 * Compresses ascending seasons into ranges: ["2020","2021","2022","2025"]
 * becomes "2020–2022, 2025". A gap means the player left and came back.
 */
export function formatSeasonRanges(seasons: readonly string[]): string {
  const years = [...new Set(seasons)]
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const parts: string[] = [];
  let start: number | null = null;
  let prev: number | null = null;
  for (const y of years) {
    if (start === null || prev === null) {
      start = y;
    } else if (y !== prev + 1) {
      parts.push(start === prev ? String(start) : `${start}–${prev}`);
      start = y;
    }
    prev = y;
  }
  if (start !== null && prev !== null) {
    parts.push(start === prev ? String(start) : `${start}–${prev}`);
  }
  return parts.join(", ");
}

/**
 * Trade and departure notes for one team. `rosterBySeason` is the team's
 * roster slot in each season, since a slot number only identifies a team
 * within one season. Failed transactions never moved anyone.
 */
export function buildMoveNotes(
  playerIds: Iterable<string>,
  transactions: readonly FranchiseTransactionInput[],
  rosterBySeason: ReadonlyMap<string, number>,
  currentPlayers: ReadonlySet<string>,
  teamOf: (season: string, rosterId: number) => FranchiseTeamRef | null,
): Map<string, FranchiseMoveNote> {
  const wanted = new Set(playerIds);
  const moves = new Map<
    string,
    Array<{
      dir: "in" | "out";
      trade: boolean;
      partner: number | null;
      season: string;
      at: number;
    }>
  >();
  for (const { season, tx } of transactions) {
    if (tx.status !== "complete") continue;
    const mine = rosterBySeason.get(season);
    if (mine === undefined) continue;
    const at = tx.status_updated || tx.created;
    const trade = tx.type === "trade";
    for (const [playerId, rosterId] of Object.entries(tx.adds ?? {})) {
      if (rosterId !== mine || !wanted.has(playerId)) continue;
      const list = moves.get(playerId) ?? [];
      list.push({
        dir: "in",
        trade,
        partner: trade ? (tx.drops?.[playerId] ?? null) : null,
        season,
        at,
      });
      moves.set(playerId, list);
    }
    for (const [playerId, rosterId] of Object.entries(tx.drops ?? {})) {
      if (rosterId !== mine || !wanted.has(playerId)) continue;
      const list = moves.get(playerId) ?? [];
      list.push({
        dir: "out",
        trade,
        partner: trade ? (tx.adds?.[playerId] ?? null) : null,
        season,
        at,
      });
      moves.set(playerId, list);
    }
  }

  const notes = new Map<string, FranchiseMoveNote>();
  for (const [playerId, list] of moves) {
    list.sort((a, b) => b.at - a.at);
    const team = (m: { partner: number | null; season: string }) =>
      m.partner === null ? null : teamOf(m.season, m.partner);
    if (currentPlayers.has(playerId)) {
      const arrival = list.find((m) => m.dir === "in");
      if (arrival?.trade) {
        notes.set(playerId, {
          kind: "acquired",
          team: team(arrival),
          season: arrival.season,
          at: arrival.at,
        });
      }
      continue;
    }
    const exit = list.find((m) => m.dir === "out");
    if (!exit) continue;
    notes.set(playerId, {
      kind: exit.trade ? "traded-away" : "dropped",
      team: exit.trade ? team(exit) : null,
      season: exit.season,
      at: exit.at,
    });
  }
  return notes;
}

/**
 * Loads one manager's franchise history from the ingest cache, keyed by
 * Sleeper user ID. Returns null when the manager has no seasons on file.
 */
export async function getManagerFranchiseHistory(
  userId: string,
): Promise<FranchiseHistory | null> {
  const loaded = await loadManagerSeasons(userId);
  if (!loaded) return null;
  const history = aggregateFranchiseHistory(
    loaded.seasons,
    loaded.currentPlayers,
  );

  const seasons = [...loaded.rosterBySeason.keys()];
  const transactionLists = await Promise.all(
    seasons.map((season) => readAllTransactions(season)),
  );
  const transactions = seasons.flatMap((season, i) =>
    (transactionLists[i] ?? []).map((tx) => ({ season, tx })),
  );
  const shown = [...history.scorers, ...history.tenure].map(
    (row) => row.playerId,
  );
  const moves = buildMoveNotes(
    shown,
    transactions,
    loaded.rosterBySeason,
    loaded.currentPlayers,
    (season, rosterId) => {
      const team = loaded.lookups.get(season)?.byRosterId.get(rosterId);
      return team ? { username: team.username, name: team.displayName } : null;
    },
  );
  return { ...history, moves };
}

/** The per-season inputs behind `getManagerFranchiseHistory`, read from the ingest cache. */
export async function loadManagerSeasons(userId: string): Promise<{
  seasons: FranchiseSeasonInput[];
  currentPlayers: ReadonlySet<string>;
  rosterBySeason: ReadonlyMap<string, number>;
  lookups: ReadonlyMap<string, ManagerLookup>;
} | null> {
  const cachedSeasons = await listCachedSeasons();
  const newestSeason = cachedSeasons[0];
  const lookups = new Map<string, ManagerLookup>();
  const rosterBySeason = new Map<string, number>();
  for (const season of cachedSeasons) {
    const lookup = await getManagers(season);
    lookups.set(season, lookup);
    const rosterId = lookup.byUserId.get(userId)?.rosterId;
    if (rosterId !== undefined) rosterBySeason.set(season, rosterId);
  }
  if (rosterBySeason.size === 0) return null;

  // A manager who has left the league has no current players, so every
  // player on their boards reads as former.
  let currentPlayers: ReadonlySet<string> = new Set();
  const inputs: FranchiseSeasonInput[] = [];
  for (const [season, rosterId] of rosterBySeason) {
    const [{ lastWeek, regularSeasonEndWeek }, rosters] = await Promise.all([
      getWeekBounds(season, "all"),
      readRosters(season),
    ]);
    const snapshot = rosters.find((r) => r.roster_id === rosterId);
    const rostered = new Set<string>(snapshot?.players ?? []);
    if (season === newestSeason) {
      currentPlayers = new Set(snapshot?.players ?? []);
    }

    const games: FranchiseGameInput[] = [];
    for (let week = 1; week <= MAX_MATCHUP_WEEK; week += 1) {
      const matchups = await readMatchups(season, week);
      const mine = matchups?.find((m) => m.roster_id === rosterId);
      if (!mine) continue;
      // Byes and weeks in progress still show who was on the roster.
      for (const playerId of mine.players ?? []) rostered.add(playerId);
      if (week > lastWeek) continue;
      // Same filter as the record book: a null matchup_id is a bye or a ghost
      // week, and zero points is a week nobody played.
      if (
        mine.matchup_id === null ||
        mine.matchup_id === undefined ||
        mine.points === 0
      ) {
        continue;
      }
      games.push({
        week,
        phase: week > regularSeasonEndWeek ? "playoff" : "regular",
        matchup: mine,
      });
    }
    inputs.push({ season, games, rostered });
  }

  return { seasons: inputs, currentPlayers, rosterBySeason, lookups };
}
