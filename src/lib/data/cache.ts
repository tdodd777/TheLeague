import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import type {
  SleeperDraft,
  SleeperLeague,
  SleeperMatchup,
  SleeperPlayer,
  SleeperRoster,
  SleeperTradedPick,
  SleeperTransaction,
  SleeperUser,
} from "@/lib/sleeper";
import { isPlayedWeek } from "@/lib/sleeper";

import { LEAGUE_CACHE_DIR, PLAYERS_PATH, seasonDir } from "./paths";

async function readJson<T>(file: string): Promise<T> {
  const raw = await readFile(file, "utf8");
  return JSON.parse(raw) as T;
}

async function readJsonOrNull<T>(file: string): Promise<T | null> {
  try {
    return await readJson<T>(file);
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

export async function listCachedSeasons(): Promise<string[]> {
  const entries = await readdir(LEAGUE_CACHE_DIR, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .reverse();
}

export async function readLeague(season: string): Promise<SleeperLeague> {
  return readJson<SleeperLeague>(path.join(seasonDir(season), "league.json"));
}

export async function readUsers(season: string): Promise<SleeperUser[]> {
  return readJson<SleeperUser[]>(path.join(seasonDir(season), "users.json"));
}

export async function readRosters(season: string): Promise<SleeperRoster[]> {
  return readJson<SleeperRoster[]>(
    path.join(seasonDir(season), "rosters.json"),
  );
}

export async function readTradedPicks(
  season: string,
): Promise<SleeperTradedPick[]> {
  return readJson<SleeperTradedPick[]>(
    path.join(seasonDir(season), "traded_picks.json"),
  );
}

export async function readDrafts(season: string): Promise<SleeperDraft[]> {
  return readJson<SleeperDraft[]>(path.join(seasonDir(season), "drafts.json"));
}

export async function readMatchups(
  season: string,
  week: number,
): Promise<SleeperMatchup[] | null> {
  const file = path.join(
    seasonDir(season),
    `matchups-${String(week).padStart(2, "0")}.json`,
  );
  // A file on disk is not proof the week was played: Sleeper publishes the
  // whole schedule as 0-point stubs once a league is in_season, and leaves
  // matchup_id null in weeks with no games. Every consumer wants played
  // weeks only, so the filter lives here.
  const matchups = await readJsonOrNull<SleeperMatchup[]>(file);
  if (!matchups || !isPlayedWeek(matchups)) return null;
  return matchups;
}

/** Per-player projected points for a given (season, week). Map keys are sleeper player_ids. */
export async function readProjections(
  season: string,
  week: number,
): Promise<Record<string, number> | null> {
  const file = path.join(
    seasonDir(season),
    `projections-${String(week).padStart(2, "0")}.json`,
  );
  return readJsonOrNull<Record<string, number>>(file);
}

export async function readTransactions(
  season: string,
  week: number,
): Promise<SleeperTransaction[] | null> {
  const file = path.join(
    seasonDir(season),
    `transactions-${String(week).padStart(2, "0")}.json`,
  );
  return readJsonOrNull<SleeperTransaction[]>(file);
}

export async function readAllTransactions(
  season: string,
): Promise<SleeperTransaction[]> {
  const dir = seasonDir(season);
  const entries = await readdir(dir);
  const files = entries.filter((f) => f.startsWith("transactions-"));
  const all: SleeperTransaction[] = [];
  for (const file of files) {
    const list = await readJson<SleeperTransaction[]>(path.join(dir, file));
    all.push(...list);
  }
  all.sort((a, b) => b.status_updated - a.status_updated);
  return all;
}

let playersCache: Record<string, SleeperPlayer> | null = null;

export async function readPlayers(): Promise<Record<string, SleeperPlayer>> {
  if (playersCache) return playersCache;
  const data = await readJson<Record<string, SleeperPlayer>>(PLAYERS_PATH);
  playersCache = data;
  return data;
}

/**
 * What happened to one endpoint during ingest.
 *
 * - `ok`      the API answered with data, and it is on disk
 * - `empty`   the API answered, and the answer had zero rows. Nothing fresh was
 *             written. An empty answer is never allowed to erase a file that
 *             already had rows: ingest carries the previous file forward
 *             (`carriedForward`) and refuses to promote unless the live copy
 *             was empty too. A 200 with `[]` is indistinguishable from an
 *             upstream regression, so it is not treated as authority to delete.
 * - `failed`  the fetch did not succeed. Any file present for this endpoint is
 *             a previous run's, kept rather than destroyed.
 * - `skipped` not called, because league state says it cannot exist yet. Any
 *             existing file is kept, exactly as for `failed`.
 *
 * The point of the distinction: a missing file alone cannot tell you whether
 * the league had no playoff bracket or whether Sleeper was down.
 */
export type SeasonEndpointStatus = "ok" | "empty" | "failed" | "skipped";

export interface SeasonEndpointRecord {
  status: SeasonEndpointStatus;
  /** Records returned. Absent when the endpoint never answered. */
  count?: number;
  /** Failure message, when status is `failed`. */
  error?: string;
  /** Why the call was not made, when status is `skipped`. */
  reason?: string;
  /**
   * A previous run's file was kept, because this run's fetch failed, returned
   * zero rows, or was never made. The file on disk is older than `ingestedAt`.
   */
  carriedForward?: boolean;
}

/** Sleeper's `/state/nfl` at the moment of ingest, as recorded in the manifest. */
export interface SeasonManifestNflState {
  season: string;
  week: number;
  displayWeek: number;
  seasonType: string;
  seasonHasScores: boolean;
}

/**
 * Manifests written before this version defined `completedThroughWeek` as the
 * ingest fetch ceiling (`max(playoff_week_start + 3, 18)`) rather than a count
 * of played regular-season weeks, so every finished season recorded 18.
 * Version 2 is the first where the field means what its name says. Never
 * compare `completedThroughWeek` across versions; a missing `manifestVersion`
 * means version 1.
 */
export const SEASON_MANIFEST_VERSION = 2;

/** `manifest.json` inside each `data/league-cache/<season>/` directory. */
export interface SeasonManifest {
  /** See `SEASON_MANIFEST_VERSION`. Absent on manifests written before v2. */
  manifestVersion?: number;
  season: string;
  leagueId: string;
  /** Ingest run that produced this directory. */
  runId: string;
  ingestedAt: string;
  leagueStatus: string;
  /**
   * Highest league REGULAR-SEASON week whose games are finished: weeks 1..N
   * were played and scored; weeks after N are in progress, unplayed, or
   * unknown. Never exceeds `regularSeasonWeeks`.
   *
   * This is the number to bound "weeks that count" with — per-game averages,
   * expected wins, every other rate stat. It deliberately excludes playoff
   * weeks (a different population: only qualifying teams play) and NFL weeks
   * the league did not play at all. In this league `playoff_week_start` is 15,
   * so a finished season records 14 — not 18. NFL week 18 holds real player
   * scores for all twelve rosters with `matchup_id: null` on every one of
   * them, which is precisely why the number cannot come from looking at
   * whether scores are present.
   *
   * It means the same thing for a live season and a finished one, and it is
   * monotonic: ingest floors each run's value at the previous run's and
   * refuses to promote a decrease. Derived from Sleeper's NFL state and the
   * league's own settings, never from whether scores look empty — an unplayed
   * week and a failed fetch are indistinguishable by score alone.
   */
  completedThroughWeek: number;
  /** Plain-language reason the number above is what it is. */
  completedThroughWeekBasis: string;
  /**
   * Length of the league's regular season: `playoff_week_start - 1`. The
   * ceiling on `completedThroughWeek`, and one week before the bracket starts.
   */
  regularSeasonWeeks: number;
  /** League week the playoff bracket starts on, from league settings. */
  playoffWeekStart: number;
  /**
   * Highest week number this run FETCHED. A ceiling on which files can exist,
   * not a claim that any of those weeks were played. Never bound a calculation
   * with this — that mistake is what `completedThroughWeek` exists to prevent.
   */
  lastIngestWeek: number;
  nflState: SeasonManifestNflState;
  endpoints: Record<string, SeasonEndpointRecord>;
}

/** Provenance for `data/players.json`, written next to it by the ingest. */
export interface PlayersMeta {
  fetchedAt: string;
  playerCount: number;
  source: string;
}

const PLAYERS_META_PATH = path.join(
  path.dirname(PLAYERS_PATH),
  "players-meta.json",
);

export async function readSeasonManifest(
  season: string,
): Promise<SeasonManifest | null> {
  return readJsonOrNull<SeasonManifest>(
    path.join(seasonDir(season), "manifest.json"),
  );
}

/**
 * Highest REGULAR-SEASON week of `season` whose games are finished, or `null`
 * when that is unknown.
 *
 * Weeks 1..N are played and scored; N+1 onward are in progress, unplayed, or
 * playoff weeks. Playoff weeks are never included — see
 * `SeasonManifest.completedThroughWeek`. Pair this with `readSeasonManifest`
 * when you need `playoffWeekStart` as well.
 *
 * `null` means "unknown", not "zero weeks are complete" — callers deciding
 * which weeks count must not collapse the two. It is returned when the season
 * has no manifest (cached before manifests existed), when the manifest predates
 * `SEASON_MANIFEST_VERSION` 2 (where this field held the ingest fetch ceiling
 * and so reported 18 for every finished season), and when the value on disk is
 * not a usable week number.
 */
export async function readCompletedThroughWeek(
  season: string,
): Promise<number | null> {
  const manifest = await readSeasonManifest(season);
  if (!manifest) return null;
  // Pre-v2 manifests count a different thing under the same name. Reporting
  // "unknown" is honest; reporting 18 regular-season weeks is not.
  if (manifest.manifestVersion !== SEASON_MANIFEST_VERSION) return null;
  const week = manifest.completedThroughWeek;
  if (typeof week !== "number" || !Number.isFinite(week) || week < 0) {
    return null;
  }
  return week;
}

export async function readPlayersMeta(): Promise<PlayersMeta | null> {
  return readJsonOrNull<PlayersMeta>(PLAYERS_META_PATH);
}
