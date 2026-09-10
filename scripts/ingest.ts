/* eslint-disable no-console */
import {
  cp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  rmdir,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { loadEnvConfig } from "@next/env";

import {
  buildPickValueIndex,
  DEFAULT_FUTURE_PICK_SLOT,
  deriveParamsFromLeague,
  fetchValues,
  parsePickName,
  resolvePickValue,
  withDefaultSlot,
} from "../src/lib/fantasycalc";
import type { FantasyCalcEntry } from "../src/lib/fantasycalc";
import { sleeper, SleeperApiError, walkLeagueChain } from "../src/lib/sleeper";
import type {
  LeagueChainEntry,
  SleeperLeague,
  SleeperNflState,
  SleeperRoster,
  SleeperTransaction,
  SleeperUser,
} from "../src/lib/sleeper";
import type {
  PlayersMeta,
  SeasonEndpointRecord,
  SeasonManifest,
} from "../src/lib/data/cache";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(REPO_ROOT, "data");
const LEAGUE_CACHE_DIR = path.join(DATA_DIR, "league-cache");
const SNAPSHOT_DIR = path.join(DATA_DIR, "values-snapshots");
const PLAYERS_PATH = path.join(DATA_DIR, "players.json");
const PLAYERS_META_PATH = path.join(DATA_DIR, "players-meta.json");

/**
 * Everything this run fetches lands here first, outside `data/league-cache`
 * so a half-finished run is never visible to the site or to `listCachedSeasons`.
 */
const STAGING_ROOT = path.join(DATA_DIR, ".staging");
/** Where a live copy waits while its validated replacement is swapped in. */
const BACKUP_ROOT = path.join(DATA_DIR, ".backups");

/** `/players/nfl` is ~18 MB and changes slowly. Once a day is plenty. */
const PLAYERS_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** That 18 MB does not always arrive inside the default 15s. */
const PLAYERS_TIMEOUT_MS = 60_000;

/**
 * Kept in step with `SEASON_MANIFEST_VERSION` in `src/lib/data/cache.ts`,
 * duplicated rather than imported because that module resolves `@/…` aliases
 * and this script deliberately imports only types from it.
 *
 * Bump it whenever the meaning of a manifest field changes. The
 * `completedThroughWeek` floor below only compares against manifests written
 * at the same version, so a definition change is never wedged in place by the
 * numbers the old definition produced.
 */
const MANIFEST_VERSION = 2;

/**
 * How many optional fetches may die to rate limiting before the run is judged
 * untrustworthy. Sleeper 429s are retried inside the client; this counts only
 * the ones that still failed after every retry, so even a handful means the
 * run saw sustained throttling and what it staged is partial.
 */
const MAX_RATE_LIMITED_FETCHES = 10;

/**
 * Cumulative 429-after-retries across the run. Required endpoints throw
 * straight out of `ingestSeason` and abort before promotion on their own; this
 * catches the optional ones, which are absorbed into the manifest and would
 * otherwise let a throttled run promote a half-empty season.
 */
let rateLimitedFetches = 0;

// This script runs under plain `tsx`, not Next.js, so nothing has loaded the
// `.env` files for us. `next dev` and `next build` do it via @next/env; call
// the same loader here so `npm run ingest` reads `.env` and `.env.local` the
// way the docs promise it does. Without this, a fresh checkout that follows
// SETUP.md to the letter still fails with "SLEEPER_LEAGUE_ID is not set".
loadEnvConfig(REPO_ROOT);

const SLEEPER_LEAGUE_ID = process.env["SLEEPER_LEAGUE_ID"];
if (!SLEEPER_LEAGUE_ID) {
  throw new Error(
    "SLEEPER_LEAGUE_ID is not set. Add it to your .env file. See SETUP.md.",
  );
}

function rel(p: string): string {
  return path.relative(REPO_ROOT, p);
}

async function writeJson(file: string, data: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data, null, 2) + "\n", "utf8");
}

/**
 * Remove a scratch directory only if it is empty. Never recursive: another
 * run's parked copies must survive this.
 */
async function removeIfEmpty(dir: string): Promise<void> {
  try {
    await rmdir(dir);
  } catch {
    // ENOTEMPTY (something still in flight) or ENOENT. Either is fine.
  }
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }
}

/** True when `child` resolves to something strictly under `parent`. */
function isInside(parent: string, child: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return (
    relative.length > 0 &&
    !relative.startsWith("..") &&
    !path.isAbsolute(relative)
  );
}

/**
 * How many records a cached JSON file holds, or `null` when it is missing or
 * unreadable.
 *
 * The count is what makes "we would delete data" answerable. File presence is
 * not enough: an endpoint that regresses to `[]` writes a file that exists,
 * parses, and contains nothing, and the whole point of the pre-promotion diff
 * is to catch exactly that.
 */
async function jsonRecordCount(file: string): Promise<number | null> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (parsed === null) return 0;
  if (Array.isArray(parsed)) return parsed.length;
  if (typeof parsed === "object") return Object.keys(parsed).length;
  // A bare scalar (a number, a string) is one record's worth of something.
  return 1;
}

/**
 * Staging and backup directory names come from a run id so a rerun with the
 * same id reuses the same paths. Callers pass one in (`--run-id=` or
 * `INGEST_RUN_ID`); CI gets `GITHUB_RUN_ID` for free. Nothing here is derived
 * from the clock.
 */
function resolveRunId(argv: string[]): string {
  const flag = argv.find((a) => a.startsWith("--run-id="));
  const raw = flag
    ? flag.slice("--run-id=".length)
    : (process.env["INGEST_RUN_ID"] ??
      process.env["GITHUB_RUN_ID"] ??
      "local");
  const safe = raw.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 64);
  return safe.length > 0 ? safe : "local";
}

/**
 * The shrink guards below refuse to promote anything that would leave the
 * cache with less history than it has now. That is the right default for a
 * cron that pushes to master, but "upstream legitimately dropped this data"
 * does happen, and a guard with no way past it is a guard that gets deleted.
 *
 * `--allow-shrink` (or `INGEST_ALLOW_SHRINK=1`) downgrades those guards to
 * warnings for one run. It is never set in CI, it is loud in the log, and it
 * does not touch any other validation.
 *
 * It permits the promotion; it does not go looking for things to drop. Files
 * that could be carried forward still are, so what it actually lets through is
 * a decrease in `completedThroughWeek` and the loss of files no endpoint
 * claimed this run (an orphaned `draft-*.json` after `drafts` went empty).
 */
function resolveAllowShrink(argv: string[]): boolean {
  if (argv.includes("--allow-shrink")) return true;
  const env = process.env["INGEST_ALLOW_SHRINK"];
  return env === "1" || env === "true";
}

// ---------------------------------------------------------------------------
// Manifest records
// ---------------------------------------------------------------------------

/**
 * An answer of length 0 is a real answer, and the manifest says so.
 *
 * It is not, however, permission to delete anything. A 200 carrying `[]` is
 * byte-for-byte what an upstream regression looks like, and no retry fires for
 * it because nothing failed. Callers record the emptiness here and then leave
 * the previous file alone; `validateAgainstLive` decides whether the emptiness
 * is believable.
 */
function answered(count: number): SeasonEndpointRecord {
  return count > 0 ? { status: "ok", count } : { status: "empty", count };
}

function failed(err: Error): SeasonEndpointRecord {
  return { status: "failed", error: err.message };
}

function skipped(reason: string): SeasonEndpointRecord {
  return { status: "skipped", reason };
}

type Attempt<T> = { ok: true; value: T } | { ok: false; error: Error };

async function attempt<T>(fn: () => Promise<T>): Promise<Attempt<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    if (error instanceof SleeperApiError && error.status === 429) {
      rateLimitedFetches += 1;
    }
    return { ok: false, error };
  }
}

// ---------------------------------------------------------------------------
// Season ingest
// ---------------------------------------------------------------------------

function playoffWeekStart(league: SleeperLeague): number {
  return league.settings.playoff_week_start || 15;
}

/**
 * Length of the league's regular season. Weeks 1..N are head-to-head games
 * every team plays; N+1 onward belong to the bracket.
 */
function regularSeasonWeeks(league: SleeperLeague): number {
  return Math.max(0, playoffWeekStart(league) - 1);
}

/**
 * Highest week number to FETCH. A ceiling on requests, nothing more.
 *
 * Do not reach for this when you want to know how much of a season was played.
 * It overshoots on purpose so that late brackets and stray transactions land,
 * and the overshoot is real data: in 2023 (playoff_week_start 15) NFL week 18
 * returns all twelve rosters with genuine points — 100.4, 87.92, 106.5 — and
 * `matchup_id: null` on every one of them, because the league played nothing
 * that week while the rostered players kept scoring in the NFL.
 */
function maxIngestWeek(league: SleeperLeague): number {
  // Pre-draft / drafting: off-season trades and free-agent moves still post,
  // tagged as leg=1. Fetch a couple of weeks of transactions so the feed
  // stays current. (Matchups/projections won't exist; the loop skips empty.)
  if (league.status === "pre_draft" || league.status === "drafting") return 2;
  return Math.max(playoffWeekStart(league) + 3, 18);
}

/**
 * How much of the league's REGULAR SEASON is finished. Bounded by
 * `regularSeasonWeeks`, never by the fetch ceiling, so the number means the
 * same thing for a season still being played and one finished three years ago.
 *
 * Only two inputs are allowed: the league's own status/settings, and Sleeper's
 * NFL state as fetched this run. Scores are never consulted — a week of zeroes
 * looks identical whether it has not been played or whether the fetch that
 * should have filled it failed, and guessing between those is exactly the
 * dishonesty this manifest exists to prevent.
 *
 * The answer is deliberately conservative: the in-progress week is never
 * counted as complete.
 */
function deriveCompletedThroughWeek(
  league: SleeperLeague,
  state: SleeperNflState,
): { week: number; basis: string } {
  const regular = regularSeasonWeeks(league);
  const played = `its regular season is weeks 1-${regular}`;

  if (league.status === "pre_draft" || league.status === "drafting") {
    return { week: 0, basis: `league status is ${league.status}` };
  }

  const leagueSeason = Number(league.season);
  const stateSeason = Number(state.season);
  if (Number.isFinite(leagueSeason) && Number.isFinite(stateSeason)) {
    if (leagueSeason > stateSeason) {
      return {
        week: 0,
        basis: `league season ${league.season} is ahead of NFL season ${state.season}`,
      };
    }
    if (leagueSeason < stateSeason) {
      return {
        week: regular,
        basis: `season ${league.season} ended before the current NFL season ${state.season}; ${played}`,
      };
    }
  }

  if (league.status === "complete") {
    return { week: regular, basis: `league status is complete; ${played}` };
  }

  if (!state.season_has_scores) {
    return { week: 0, basis: "NFL state reports no scores yet this season" };
  }

  switch (state.season_type) {
    case "pre":
    case "off":
      return { week: 0, basis: `NFL season_type is ${state.season_type}` };
    case "post":
      // The NFL regular season is over, so every league regular-season week
      // has been played and scored. Handled explicitly because Sleeper
      // restarts `week` at 1 for the postseason: falling through to the
      // in-progress arithmetic below would compute 0 completed weeks for a
      // season that just finished playing all of them.
      return {
        week: regular,
        basis: `NFL season_type is post, so league weeks 1-${regular} are all played`,
      };
    case "regular":
      break;
    default:
      // An unrecognised season_type from upstream. Fall through to the
      // arithmetic, which is clamped to the regular season either way.
      break;
  }

  // `week` rolls over on Tuesday; `display_week` sometimes lags a day behind.
  // Take the lower of the two and subtract the week in progress.
  const candidates = [state.week, state.display_week].filter(
    (w) => Number.isFinite(w) && w > 0,
  );
  const currentWeek = candidates.length > 0 ? Math.min(...candidates) : 1;
  const week = Math.max(0, Math.min(currentWeek - 1, regular));
  return {
    week,
    basis: `NFL week ${currentWeek} is in progress (season_type ${state.season_type}); ${played}`,
  };
}

/** Why an endpoint produced no fresh file this run. */
type RecoverableReason = "failed" | "empty" | "skipped";

interface RecoverableFile {
  key: string;
  file: string;
  reason: RecoverableReason;
}

interface SeasonIngest {
  season: string;
  league: SleeperLeague;
  users: SleeperUser[];
  rosters: SleeperRoster[];
  manifest: SeasonManifest;
  stagedDir: string;
  liveDir: string;
  /**
   * Endpoints that produced no fresh file this run — the fetch failed, it
   * answered with zero rows, or it was never called — and so may have a live
   * file worth keeping. Every one of the three gets carried forward: the
   * difference between them is a story about upstream, not about whether the
   * data we already hold is still true.
   */
  recoverable: RecoverableFile[];
}

/**
 * Stage one list endpoint's answer.
 *
 * A zero-length answer is recorded in the manifest and never written over
 * anything. Writing `[]` on top of a live file that has rows is how history
 * disappears: the write succeeds, the directory swap makes it live, and CI
 * commits the deletion, with no error anywhere in the chain because a 200
 * carrying `[]` is not an error and so nothing ever retries. Instead the key
 * joins `recoverable`, the previous file is carried forward exactly as it is
 * for a failed fetch, and `validateAgainstLive` refuses the promotion if live
 * held rows this answer does not.
 *
 * `alwaysPresent` is for the handful of files the site reads with a throwing
 * reader (`users`, `rosters`, `traded_picks`, `drafts` — see
 * `src/lib/data/cache.ts`). When there is genuinely nothing live to carry
 * forward, those still get their empty array, because for them a missing file
 * is a crash rather than an absence. Files the site reads with
 * `readJsonOrNull` — weekly matchups, transactions, projections — keep the
 * existing "no file means no data" convention and are left off disk.
 */
async function stageList(
  stagedDir: string,
  liveDir: string,
  endpoints: Record<string, SeasonEndpointRecord>,
  recoverable: RecoverableFile[],
  key: string,
  file: string,
  rows: readonly unknown[],
  alwaysPresent: boolean,
): Promise<number> {
  endpoints[key] = answered(rows.length);
  if (rows.length > 0) {
    await writeJson(path.join(stagedDir, file), rows);
    return rows.length;
  }

  recoverable.push({ key, file, reason: "empty" });
  if (alwaysPresent && !(await pathExists(path.join(liveDir, file)))) {
    // First time this season has been ingested and the answer really is
    // empty: there is no history to protect, and a reader is waiting on the
    // file existing.
    await writeJson(path.join(stagedDir, file), rows);
  }
  return 0;
}

/**
 * Fetch one season into `stagedDir`. Required endpoints (league membership,
 * drafts, weekly matchups and transactions) throw on failure, which aborts the
 * run before anything is promoted. Optional ones (brackets, projections) are
 * recorded as failed and carried forward from the live copy instead.
 *
 * No endpoint's answer, however empty, ever removes a file that already exists
 * — see `stageList`. What the season ends up holding is checked against what
 * it holds now in `validateAgainstLive`, before any of this is promoted.
 */
async function ingestSeason(
  league: SleeperLeague,
  state: SleeperNflState,
  runId: string,
  stagedDir: string,
): Promise<SeasonIngest> {
  console.log(
    `\n[${league.season}] ingest league_id=${league.league_id} status=${league.status}`,
  );
  await mkdir(stagedDir, { recursive: true });

  const liveDir = path.join(LEAGUE_CACHE_DIR, league.season);
  const endpoints: Record<string, SeasonEndpointRecord> = {};
  const recoverable: RecoverableFile[] = [];

  const [users, rosters, tradedPicks, drafts] = await Promise.all([
    sleeper.users(league.league_id),
    sleeper.rosters(league.league_id),
    sleeper.tradedPicks(league.league_id),
    sleeper.drafts(league.league_id),
  ]);
  endpoints["league"] = { status: "ok", count: 1 };
  await writeJson(path.join(stagedDir, "league.json"), league);

  const stage = (
    key: string,
    file: string,
    rows: readonly unknown[],
  ): Promise<number> =>
    stageList(
      stagedDir,
      liveDir,
      endpoints,
      recoverable,
      key,
      file,
      rows,
      false,
    );

  /** For the files the site reads with a throwing reader. */
  const stageRequired = (
    key: string,
    file: string,
    rows: readonly unknown[],
  ): Promise<number> =>
    stageList(stagedDir, liveDir, endpoints, recoverable, key, file, rows, true);

  await stageRequired("users", "users.json", users);
  await stageRequired("rosters", "rosters.json", rosters);
  await stageRequired("traded_picks", "traded_picks.json", tradedPicks);
  await stageRequired("drafts", "drafts.json", drafts);

  // Playoff brackets are only published once the season is in playoffs / done.
  // For pre-draft seasons the endpoint returns an empty array — we skip those.
  const brackets = [
    {
      key: "winners_bracket",
      file: "winners_bracket.json",
      fetch: () => sleeper.winnersBracket(league.league_id),
    },
    {
      key: "losers_bracket",
      file: "losers_bracket.json",
      fetch: () => sleeper.losersBracket(league.league_id),
    },
  ];
  const bracketsExist =
    league.status === "in_season" || league.status === "complete";
  for (const bracket of brackets) {
    if (!bracketsExist) {
      endpoints[bracket.key] = skipped(`league status is ${league.status}`);
      // Not calling an endpoint says nothing about whether last run's answer
      // is still good, so a skip carries forward exactly like a failure. Left
      // out, a season that slipped back to pre_draft would drop the bracket it
      // already has.
      recoverable.push({
        key: bracket.key,
        file: bracket.file,
        reason: "skipped",
      });
      continue;
    }
    const got = await attempt(bracket.fetch);
    if (!got.ok) {
      endpoints[bracket.key] = failed(got.error);
      recoverable.push({
        key: bracket.key,
        file: bracket.file,
        reason: "failed",
      });
      console.log(`  ! ${bracket.key} ${league.season}: ${got.error.message}`);
      continue;
    }
    await stage(bracket.key, bracket.file, got.value);
  }

  for (const draft of drafts) {
    const [picks, draftTradedPicks] = await Promise.all([
      sleeper.draftPicks(draft.draft_id),
      sleeper.draftTradedPicks(draft.draft_id),
    ]);
    await writeJson(
      path.join(stagedDir, `draft-${draft.draft_id}.json`),
      draft,
    );
    await stage(
      `draft-${draft.draft_id}-picks`,
      `draft-${draft.draft_id}-picks.json`,
      picks,
    );
    await stage(
      `draft-${draft.draft_id}-traded-picks`,
      `draft-${draft.draft_id}-traded-picks.json`,
      draftTradedPicks,
    );
  }

  const maxWeek = maxIngestWeek(league);
  let matchupWeeks = 0;
  let transactionsCount = 0;
  let projectionWeeks = 0;

  for (let week = 1; week <= maxWeek; week += 1) {
    const ww = String(week).padStart(2, "0");
    const [matchups, transactions, projections] = await Promise.all([
      sleeper.matchups(league.league_id, week),
      sleeper.transactions(league.league_id, week),
      // Projections for some past weeks 404 (rare) and are not worth failing
      // the run over — the manifest records the gap instead.
      attempt(() => sleeper.projections(league.season, week)),
    ]);

    if ((await stage(`matchups-${ww}`, `matchups-${ww}.json`, matchups)) > 0) {
      matchupWeeks += 1;
    }

    transactionsCount += await stage(
      `transactions-${ww}`,
      `transactions-${ww}.json`,
      transactions as SleeperTransaction[],
    );

    if (!projections.ok) {
      endpoints[`projections-${ww}`] = failed(projections.error);
      recoverable.push({
        key: `projections-${ww}`,
        file: `projections-${ww}.json`,
        reason: "failed",
      });
      console.log(
        `  ! projections ${league.season}/wk${week}: ${projections.error.message}`,
      );
      continue;
    }

    // Slim payload: keep only `pts_ppr` (this league is full PPR with
    // bonus_rec_te=0, so pts_ppr is exactly the projected score). Drop
    // the rest of the per-player stat block to keep git size tractable.
    const slim: Record<string, number> = {};
    for (const [playerId, stats] of Object.entries(projections.value)) {
      const pts = stats?.["pts_ppr"];
      if (typeof pts === "number" && Number.isFinite(pts)) {
        slim[playerId] = Math.round(pts * 100) / 100;
      }
    }
    const slimCount = Object.keys(slim).length;
    endpoints[`projections-${ww}`] = answered(slimCount);
    if (slimCount > 0) {
      await writeJson(path.join(stagedDir, `projections-${ww}.json`), slim);
      projectionWeeks += 1;
    } else {
      // The likeliest way this whole file ever loses data: the fetch succeeds,
      // but `pts_ppr` is renamed or absent (old seasons age out of the
      // projections endpoint), so the slim filter keeps nothing. Nothing
      // failed, so nothing retried. Carry the previous file forward and let
      // validation refuse the promotion.
      recoverable.push({
        key: `projections-${ww}`,
        file: `projections-${ww}.json`,
        reason: "empty",
      });
    }
  }

  const completed = deriveCompletedThroughWeek(league, state);
  const manifest: SeasonManifest = {
    manifestVersion: MANIFEST_VERSION,
    season: league.season,
    leagueId: league.league_id,
    runId,
    ingestedAt: new Date().toISOString(),
    leagueStatus: league.status,
    completedThroughWeek: completed.week,
    completedThroughWeekBasis: completed.basis,
    regularSeasonWeeks: regularSeasonWeeks(league),
    playoffWeekStart: playoffWeekStart(league),
    lastIngestWeek: maxWeek,
    nflState: {
      season: state.season,
      week: state.week,
      displayWeek: state.display_week,
      seasonType: state.season_type,
      seasonHasScores: state.season_has_scores,
    },
    endpoints,
  };

  console.log(
    `  rosters=${rosters.length} users=${users.length} traded_picks=${tradedPicks.length} drafts=${drafts.length} matchup_weeks=${matchupWeeks} tx=${transactionsCount} projection_weeks=${projectionWeeks} completed_through_week=${completed.week}`,
  );

  return {
    season: league.season,
    league,
    users,
    rosters,
    manifest,
    stagedDir,
    liveDir,
    recoverable,
  };
}

const CARRY_FORWARD_REASON: Record<RecoverableReason, string> = {
  failed: "this run's fetch failed",
  empty: "this run's fetch answered with 0 rows",
  skipped: "this run did not call the endpoint",
};

/**
 * An endpoint that produced nothing this run must not erase what a previous
 * run already got. Copy the live file into staging so the directory swap keeps
 * it, and mark the manifest so nobody mistakes it for fresh data.
 *
 * All three reasons are treated alike. A fetch that failed and a fetch that
 * returned `[]` differ only in what upstream did; neither is evidence that the
 * rows we already hold stopped being true. The original asymmetry — carry
 * forward on failure, overwrite on empty — is what let a 200 with an empty
 * body delete four seasons of history.
 */
async function carryForwardMissing(season: SeasonIngest): Promise<void> {
  for (const item of season.recoverable) {
    const stagedFile = path.join(season.stagedDir, item.file);
    const liveFile = path.join(season.liveDir, item.file);
    if (await pathExists(stagedFile)) continue;
    if (!(await pathExists(liveFile))) continue;
    await cp(liveFile, stagedFile);
    const record = season.manifest.endpoints[item.key];
    if (record) {
      season.manifest.endpoints[item.key] = { ...record, carriedForward: true };
    }
    console.log(
      `  kept previous ${season.season}/${item.file} (${CARRY_FORWARD_REASON[item.reason]})`,
    );
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * The chain must be an unbroken run of consecutive seasons ending at a league
 * with no predecessor. Season count is never asserted — it grows every year.
 */
function validateChain(chain: LeagueChainEntry[]): string[] {
  const problems: string[] = [];
  if (chain.length === 0) {
    problems.push("league chain is empty");
    return problems;
  }

  const seen = new Set<string>();
  for (const entry of chain) {
    if (seen.has(entry.season)) {
      problems.push(`season ${entry.season} appears twice in the chain`);
    }
    seen.add(entry.season);
  }

  for (let i = 0; i < chain.length - 1; i += 1) {
    const newer = chain[i];
    const older = chain[i + 1];
    if (!newer || !older) continue;
    if (newer.league.previous_league_id !== older.league.league_id) {
      problems.push(
        `chain break: ${newer.season} previous_league_id=${newer.league.previous_league_id ?? "null"} but next link is ${older.season} (${older.league.league_id})`,
      );
    }
    const a = Number(newer.season);
    const b = Number(older.season);
    if (!Number.isInteger(a) || !Number.isInteger(b) || a - b !== 1) {
      problems.push(
        `chain break: seasons ${older.season} and ${newer.season} are not consecutive`,
      );
    }
  }

  const oldest = chain[chain.length - 1];
  if (oldest && oldest.league.previous_league_id) {
    problems.push(
      `chain truncated: oldest season ${oldest.season} still points at previous_league_id=${oldest.league.previous_league_id}`,
    );
  }

  return problems;
}

function validateSeason(season: SeasonIngest): string[] {
  const problems: string[] = [];
  const expectedRosters = season.league.total_rosters;

  if (season.rosters.length !== expectedRosters) {
    problems.push(
      `${season.season}: ${season.rosters.length} rosters, league says total_rosters=${expectedRosters}`,
    );
  }
  if (season.users.length === 0) {
    problems.push(`${season.season}: no users returned`);
  }

  const userIds = new Set(season.users.map((u) => u.user_id));
  for (const roster of season.rosters) {
    const owner = roster.owner_id;
    if (!owner || !userIds.has(owner)) {
      problems.push(
        `${season.season}: roster ${roster.roster_id} owner ${owner ?? "(none)"} does not resolve to a league user`,
      );
    }
  }

  return problems;
}

/**
 * The manifest is rewritten from scratch every run, so it is the one file the
 * diff below cannot use as evidence of loss.
 */
const REWRITTEN_EVERY_RUN = new Set(["manifest.json"]);

/**
 * Compare what is actually staged on disk against what is actually live on
 * disk, and refuse to promote anything that would leave the season with less
 * than it has now.
 *
 * Everything else in this file validates in-memory objects. That is the gap
 * that made an empty upstream answer lethal: `drafts()` returns `[]`, the
 * manifest honestly records `empty`, the roster and user checks pass because
 * they look at different arrays entirely, and the whole-directory rename then
 * deletes a season's draft history with every check green. The only question
 * that catches it is the one asked here — is the thing about to become live
 * smaller than the thing it replaces?
 *
 * Two ways a file can shrink, and both are checked:
 *
 *  - it is missing from staging, because the loop that would have written it
 *    never ran (an empty `drafts.json` means the `draft-*.json` files are
 *    never even attempted);
 *  - it is present but holds zero records, because the endpoint answered with
 *    an empty body.
 *
 * A carried-forward file passes: it was copied from live, so it matches. That
 * is the exemption for genuinely failed and skipped endpoints, and it is
 * enforced by the bytes rather than by trusting the manifest's own account of
 * itself.
 */
async function validateAgainstLive(season: SeasonIngest): Promise<string[]> {
  const problems: string[] = [];
  if (!(await pathExists(season.liveDir))) return problems;

  const entries = await readdir(season.liveDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith(".json")) continue;
    if (REWRITTEN_EVERY_RUN.has(entry.name)) continue;

    const liveCount = await jsonRecordCount(
      path.join(season.liveDir, entry.name),
    );
    // Unreadable or already empty: there is nothing here left to lose.
    if (liveCount === null || liveCount === 0) continue;

    const stagedFile = path.join(season.stagedDir, entry.name);
    const stagedCount = await jsonRecordCount(stagedFile);
    if (stagedCount === null) {
      const how = (await pathExists(stagedFile)) ? "unreadable" : "missing";
      problems.push(
        `${season.season}: live ${entry.name} holds ${liveCount} record(s) but the staged copy is ${how}; promoting would delete it`,
      );
      continue;
    }
    if (stagedCount === 0) {
      problems.push(
        `${season.season}: live ${entry.name} holds ${liveCount} record(s) but the staged copy holds 0; promoting would empty it`,
      );
    }
  }

  // The bytes-on-disk check above cannot see an endpoint whose emptiness was
  // masked by a successful carry-forward, and that case still matters: it
  // means upstream is now serving nothing where it used to serve rows. Say so
  // rather than promoting a manifest that quietly claims the season is empty.
  for (const item of season.recoverable) {
    if (item.reason !== "empty") continue;
    const liveCount = await jsonRecordCount(
      path.join(season.liveDir, item.file),
    );
    if (liveCount === null || liveCount === 0) continue;
    problems.push(
      `${season.season}: ${item.key} answered with 0 rows but live ${item.file} holds ${liveCount}; an empty 200 is not evidence the data is gone`,
    );
  }

  return problems;
}

/**
 * `completedThroughWeek` is a high-water mark, and it is recomputed from
 * scratch every run out of a mutable upstream field. Nothing in the derivation
 * stops it going backwards: one bad `/state/nfl` response and four seasons
 * quietly record less completeness than they did yesterday, in a commit that
 * looks like every other commit.
 *
 * So: floor this run's value at the previous run's, say so loudly, and
 * promote. The floored manifest is provably safe (it claims no more than the
 * previous run did), and failing the whole run here would freeze site data
 * in-season over what is usually one transient bad response. `--allow-shrink`
 * is the one way to let the number actually decrease. Only manifests written
 * at the current `MANIFEST_VERSION` are used as a floor — comparing across
 * versions would let the old definition (which recorded the fetch ceiling,
 * 18, for every finished season) wedge the corrected one out forever.
 */
async function enforceWatermarkFloor(
  season: SeasonIngest,
  allowShrink: boolean,
): Promise<string[]> {
  const previousPath = path.join(season.liveDir, "manifest.json");
  const raw = await readFile(previousPath, "utf8").catch(() => null);
  if (raw === null) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    console.log(
      `  [${season.season}] previous manifest is unreadable; no completeness floor applied`,
    );
    return [];
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return [];
  }

  const previous = parsed as Partial<SeasonManifest>;
  if (previous.manifestVersion !== MANIFEST_VERSION) {
    console.log(
      `  [${season.season}] previous manifest is v${String(previous.manifestVersion ?? 1)}, this run writes v${MANIFEST_VERSION}; not using it as a completeness floor`,
    );
    return [];
  }

  const before = previous.completedThroughWeek;
  if (typeof before !== "number" || !Number.isFinite(before)) return [];

  const now = season.manifest.completedThroughWeek;
  if (now >= before) return [];

  if (allowShrink) {
    console.log(
      `  [${season.season}] letting completedThroughWeek drop ${before} -> ${now} (--allow-shrink)`,
    );
    return [
      `${season.season}: completedThroughWeek dropped from ${before} to ${now} ` +
        `(${season.manifest.completedThroughWeekBasis})`,
    ];
  }

  // Floor and continue. The floored manifest claims nothing the previous run
  // did not, so it is safe to promote; the loud line is so a persistently
  // weird upstream shows up in every log rather than only the first.
  console.error(
    `  [${season.season}] completedThroughWeek tried to drop ${before} -> ${now} ` +
      `(${season.manifest.completedThroughWeekBasis}); flooring at ${before} and continuing`,
  );
  season.manifest.completedThroughWeek = before;
  season.manifest.completedThroughWeekBasis = `${season.manifest.completedThroughWeekBasis}; floored at the previous run's ${before}`;
  return [];
}

// ---------------------------------------------------------------------------
// Promotion
// ---------------------------------------------------------------------------

export interface Promotion {
  label: string;
  /** Absolute path inside the staging tree. */
  staged: string;
  /** Absolute final path. */
  live: string;
  /** Absolute path the live copy is parked at during the swap. */
  backup: string;
}

/**
 * Where promotion operates. Injectable so the promotion/recovery pair can be
 * exercised against a scratch directory in tests; every real caller uses the
 * repo defaults.
 */
export interface PromotionRoots {
  /** Directory every journal path is stored relative to (and confined to). */
  dataDir: string;
  /** Where interrupted runs park live copies. */
  backupRoot: string;
}

const DEFAULT_ROOTS: PromotionRoots = {
  dataDir: DATA_DIR,
  backupRoot: BACKUP_ROOT,
};

interface JournalEntry {
  /** Cosmetic, for the log. Recovery works without it. */
  label?: string;
  liveRel: string;
  backupRel: string;
}

/**
 * Swap staged copies into place. For each item: park the live copy aside,
 * move staging in, and only once every item has landed delete the parked
 * copies. A crash mid-swap leaves the previous copy in `.backups`, which the
 * next run puts back (see `recoverInterruptedPromotions`).
 */
export async function promoteAll(
  runId: string,
  plans: Promotion[],
  roots: PromotionRoots = DEFAULT_ROOTS,
): Promise<void> {
  if (plans.length === 0) return;

  const backupDir = path.join(roots.backupRoot, runId);
  await mkdir(backupDir, { recursive: true });
  const journal: JournalEntry[] = plans.map((p) => ({
    label: p.label,
    liveRel: path.relative(roots.dataDir, p.live),
    backupRel: path.relative(roots.dataDir, p.backup),
  }));
  await writeJson(path.join(backupDir, "journal.json"), journal);

  const done: Array<Promotion & { hadLive: boolean }> = [];
  console.log(`\n[promote] ${plans.length} item(s)`);
  try {
    for (const plan of plans) {
      await mkdir(path.dirname(plan.live), { recursive: true });
      await mkdir(path.dirname(plan.backup), { recursive: true });
      const hadLive = await pathExists(plan.live);
      if (hadLive) await rename(plan.live, plan.backup);
      try {
        await rename(plan.staged, plan.live);
      } catch (err) {
        if (hadLive) await rename(plan.backup, plan.live);
        throw err;
      }
      done.push({ ...plan, hadLive });
      console.log(`  ${plan.label}`);
    }
  } catch (err) {
    console.error(
      `\n[promote] failed; restoring ${done.length} already-swapped item(s)`,
    );
    for (const entry of [...done].reverse()) {
      try {
        if (!entry.hadLive) {
          // Nothing was there before; taking the new copy away is the undo.
          await rm(entry.live, { recursive: true, force: true });
          continue;
        }
        // Move the new copy aside before putting the old one back, so the
        // previous copy exists at `backup` or at `live` at every instant —
        // deleting first would open a window where neither does.
        const displaced = `${entry.backup}.superseded`;
        await rm(displaced, { recursive: true, force: true });
        await rename(entry.live, displaced);
        await rename(entry.backup, entry.live);
        await rm(displaced, { recursive: true, force: true });
      } catch (restoreErr) {
        console.error(`  could not restore ${entry.label}:`, restoreErr);
      }
    }
    throw err;
  }

  for (const entry of done) {
    if (entry.hadLive) {
      await rm(entry.backup, { recursive: true, force: true });
    }
  }
  await rm(backupDir, { recursive: true, force: true });
}

/**
 * A journal is JSON someone else's crashed process wrote. `JSON.parse` only
 * proves it is syntactically JSON — `{}`, `null` and `"x"` all parse cleanly
 * and then explode on the first `for…of`. Recovery runs before this process
 * fetches a byte, so an unchecked shape there does not fail one run, it wedges
 * every future run, and locally the run id is the constant "local" so the
 * wedged file never even rotates away.
 */
function isJournalEntry(value: unknown): value is JournalEntry {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record["liveRel"] === "string" &&
    typeof record["backupRel"] === "string" &&
    record["liveRel"].length > 0 &&
    record["backupRel"].length > 0
  );
}

/**
 * A run killed between "park the live copy" and "move staging in" leaves the
 * only good copy under `.backups`. Put those back before this run touches
 * anything, so a season is never missing while a copy of it still exists.
 *
 * Every failure in here is a warning, never a throw. Recovery exists to save
 * data; a recovery that refuses to finish must not also stop a healthy run
 * from fetching. Anything it cannot make sense of is left on disk untouched
 * for a human, which is loud every run and costs nothing but log lines.
 */
export async function recoverInterruptedPromotions(
  roots: PromotionRoots = DEFAULT_ROOTS,
): Promise<void> {
  if (!(await pathExists(roots.backupRoot))) return;
  const runDirs = await readdir(roots.backupRoot, { withFileTypes: true });

  for (const dirent of runDirs) {
    if (!dirent.isDirectory()) continue;
    const runDir = path.join(roots.backupRoot, dirent.name);
    const journalPath = path.join(runDir, "journal.json");

    if (!(await pathExists(journalPath))) {
      // No journal means no rename ever happened under this run id.
      await rm(runDir, { recursive: true, force: true });
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(journalPath, "utf8")) as unknown;
    } catch (err) {
      console.error(
        `\n[recover] ${rel(journalPath)} is unreadable; leaving ${rel(runDir)} in place for a human:`,
        err,
      );
      continue;
    }

    if (!Array.isArray(parsed)) {
      console.error(
        `\n[recover] ${rel(journalPath)} is ${parsed === null ? "null" : typeof parsed}, not an array of entries; leaving ${rel(runDir)} in place for a human`,
      );
      continue;
    }

    let restored = 0;
    let complete = true;
    for (const candidate of parsed) {
      if (!isJournalEntry(candidate)) {
        console.error(
          `\n[recover] ${rel(journalPath)} has an entry that is not {liveRel, backupRel}; skipping it`,
        );
        complete = false;
        continue;
      }
      const entry: JournalEntry = candidate;
      const live = path.join(roots.dataDir, entry.liveRel);
      const backup = path.join(roots.dataDir, entry.backupRel);
      // Both sides are renamed with no further checks, so a `../../` in a
      // journal would move a directory clean out of the repo. Paths are
      // relative to the data dir by construction; anything that resolves
      // outside it did not come from `promoteAll`.
      if (!isInside(roots.dataDir, live) || !isInside(roots.dataDir, backup)) {
        console.error(
          `\n[recover] ${rel(journalPath)} entry points outside ${rel(roots.dataDir)} (liveRel=${entry.liveRel} backupRel=${entry.backupRel}); refusing to act on it`,
        );
        complete = false;
        continue;
      }

      try {
        if (!(await pathExists(backup))) continue;
        if (await pathExists(live)) {
          await rm(backup, { recursive: true, force: true });
          continue;
        }
        await mkdir(path.dirname(live), { recursive: true });
        await rename(backup, live);
        restored += 1;
        console.log(
          `[recover] restored ${entry.label ?? entry.liveRel} from ${rel(backup)}`,
        );
      } catch (err) {
        console.error(
          `\n[recover] could not restore ${entry.liveRel} from ${rel(backup)}; leaving it in place:`,
          err,
        );
        complete = false;
      }
    }
    if (restored > 0) {
      console.log(
        `[recover] put back ${restored} item(s) left behind by run ${dirent.name}`,
      );
    }
    // Only discard the parked copies once every entry has been accounted for.
    // A run dir that still holds something we could not place is the only copy
    // of it that exists.
    if (complete) {
      await rm(runDir, { recursive: true, force: true });
    } else {
      console.error(
        `[recover] leaving ${rel(runDir)} in place; some entries were not recovered`,
      );
    }
  }

  await removeIfEmpty(roots.backupRoot);
}

// ---------------------------------------------------------------------------
// FantasyCalc + players
// ---------------------------------------------------------------------------

function todayUtc(): string {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

interface ValuesSnapshot {
  fetched_at: string;
  league_id: string;
  params: {
    dynasty: ReturnType<typeof deriveParamsFromLeague>;
    redraft: ReturnType<typeof deriveParamsFromLeague>;
  };
  dynasty: FantasyCalcEntry[];
  redraft: FantasyCalcEntry[];
}

async function snapshotFantasyCalc(
  league: SleeperLeague,
  stagedFile: string,
): Promise<ValuesSnapshot> {
  const dynastyParams = deriveParamsFromLeague(league, true);
  const redraftParams = deriveParamsFromLeague(league, false);
  console.log(
    `\n[fantasycalc] dynasty params: ${JSON.stringify(dynastyParams)}`,
  );
  console.log(`[fantasycalc] redraft params: ${JSON.stringify(redraftParams)}`);

  const [dynasty, redraft] = await Promise.all([
    fetchValues(dynastyParams),
    fetchValues(redraftParams),
  ]);

  const snapshot: ValuesSnapshot = {
    fetched_at: new Date().toISOString(),
    league_id: league.league_id,
    params: { dynasty: dynastyParams, redraft: redraftParams },
    dynasty,
    redraft,
  };

  await writeJson(stagedFile, snapshot);
  console.log(
    `  dynasty_entries=${dynasty.length} redraft_entries=${redraft.length} -> staged`,
  );
  return snapshot;
}

/**
 * Freshness comes from the `fetchedAt` we wrote, never from file mtime: a CI
 * checkout rewrites mtime on every run, so mtime always looks brand new.
 */
async function playersAreFresh(): Promise<boolean> {
  if (!(await pathExists(PLAYERS_PATH))) return false;
  const raw = await readFile(PLAYERS_META_PATH, "utf8").catch(() => null);
  if (raw === null) return false;
  let meta: PlayersMeta;
  try {
    meta = JSON.parse(raw) as PlayersMeta;
  } catch {
    return false;
  }
  const fetchedAt = Date.parse(meta.fetchedAt ?? "");
  if (Number.isNaN(fetchedAt)) return false;
  const age = Date.now() - fetchedAt;
  // A future timestamp means a clock jumped somewhere; refetch rather than
  // trust it.
  if (age < 0) return false;
  return age < PLAYERS_MAX_AGE_MS;
}

interface PlayersRefresh {
  fetched: boolean;
  count: number;
}

async function refreshPlayers(
  stagedPlayers: string,
  stagedMeta: string,
): Promise<PlayersRefresh> {
  if (await playersAreFresh()) {
    console.log(
      `\n[players] skipping /players/nfl, data/players-meta.json is under 24h old`,
    );
    return { fetched: false, count: 0 };
  }

  console.log(`\n[players] fetching /players/nfl (~18 MB)…`);
  const players = await sleeper.players({ timeoutMs: PLAYERS_TIMEOUT_MS });
  const count = Object.keys(players).length;
  const meta: PlayersMeta = {
    fetchedAt: new Date().toISOString(),
    playerCount: count,
    source: "sleeper:/players/nfl",
  };
  await writeJson(stagedPlayers, players);
  await writeJson(stagedMeta, meta);
  console.log(`  player_count=${count} -> staged`);
  return { fetched: true, count };
}

function summarizeSamples(snapshot: ValuesSnapshot): void {
  console.log(`\n=== samples ===`);
  const top = snapshot.dynasty.slice(0, 5);
  console.log(`top 5 dynasty assets:`);
  for (const e of top) {
    console.log(
      `  #${e.overallRank.toString().padStart(2, " ")} ${e.player.position.padEnd(2)} ${e.player.name.padEnd(28)} value=${e.value} trend30=${e.trend30Day}`,
    );
  }

  const picks = snapshot.dynasty.filter((e) => e.player.position === "PICK");
  const parsed = picks
    .map((e) => parsePickName(e.player.name))
    .filter((p): p is NonNullable<typeof p> => p !== null);
  console.log(`\npick parse: ${parsed.length}/${picks.length}`);

  const index = buildPickValueIndex(snapshot.dynasty);
  console.log(
    `pick index: ${index.bySlot.size} slot-keyed, ${index.byRound.size} round-keyed`,
  );

  // Demonstrate exact-slot resolution. Every pick is canonicalised to
  // "YYYY Pick R.PP"; future-year picks borrow the league default slot.
  const examples: Array<{ label: string; ident: ReturnType<typeof parsePickName> }> = [
    { label: "current-year exact", ident: { season: 2026, round: 1, slot: 4 } },
    { label: "current-year mid (slot=7)", ident: { season: 2026, round: 1, slot: DEFAULT_FUTURE_PICK_SLOT } },
    { label: `2027 1st (defaulted slot=${DEFAULT_FUTURE_PICK_SLOT})`, ident: withDefaultSlot({ season: 2027, round: 1, slot: null }) },
    { label: `2028 2nd (defaulted slot=${DEFAULT_FUTURE_PICK_SLOT})`, ident: withDefaultSlot({ season: 2028, round: 2, slot: null }) },
    { label: `2029 3rd (defaulted slot=${DEFAULT_FUTURE_PICK_SLOT})`, ident: withDefaultSlot({ season: 2029, round: 3, slot: null }) },
  ];
  console.log(`\nresolver demo:`);
  for (const ex of examples) {
    if (!ex.ident) continue;
    const r = resolvePickValue(ex.ident, index);
    if (!r) {
      console.log(`  ${ex.label.padEnd(36)} (no entry)`);
      continue;
    }
    console.log(
      `  ${ex.label.padEnd(36)} "${r.entry.player.name}" value=${r.value} source=${r.source}`,
    );
  }

  const unparsed = picks
    .filter((e) => parsePickName(e.player.name) === null)
    .slice(0, 5);
  if (unparsed.length) {
    console.log(`  ! unparsed examples:`);
    for (const e of unparsed) console.log(`    "${e.player.name}"`);
  }
}

// ---------------------------------------------------------------------------

async function main(runId: string, allowShrink: boolean): Promise<void> {
  const stagingDir = path.join(STAGING_ROOT, runId);

  console.log(`league-page ingest`);
  console.log(`  league_id=${SLEEPER_LEAGUE_ID}`);
  console.log(`  run_id=${runId}`);
  console.log(`  data_dir=${rel(DATA_DIR)}`);
  console.log(`  staging=${rel(stagingDir)}`);
  if (allowShrink) {
    console.log(`  allow_shrink=true (data-loss guards downgraded to warnings)`);
  }

  // Recovery is best-effort by design: it exists to put data back, and a
  // recovery that cannot finish must not stop this run from fetching. Whatever
  // it could not handle is still on disk, and still reported above.
  try {
    await recoverInterruptedPromotions();
  } catch (err) {
    console.error(
      `\n[recover] recovery pass failed; continuing with a fresh fetch. Check ${rel(BACKUP_ROOT)} by hand:`,
      err,
    );
  }

  // Only this run's staging tree. Clearing all of `.staging` would delete a
  // concurrently running ingest's staged files out from under it — `writeJson`
  // remakes the directories on the next write, so that run would notice
  // nothing and promote a season containing only the weeks it happened to
  // write after the wipe.
  await rm(stagingDir, { recursive: true, force: true });

  const state = await sleeper.nflState();
  console.log(
    `\n[nfl-state] season=${state.season} type=${state.season_type} week=${state.week} display_week=${state.display_week} has_scores=${state.season_has_scores}`,
  );

  const chain = await walkLeagueChain(SLEEPER_LEAGUE_ID);
  console.log(
    `\n[chain] ${chain.length} seasons: ${chain.map((c) => c.season).join(", ")}`,
  );
  const chainProblems = validateChain(chain);
  if (chainProblems.length > 0) {
    for (const p of chainProblems) console.error(`  - ${p}`);
    throw new Error(
      `league chain failed validation (${chainProblems.length} problem(s)); nothing fetched, live cache untouched`,
    );
  }

  const seasons: SeasonIngest[] = [];
  for (const { league } of chain) {
    const staged = path.join(stagingDir, "league-cache", league.season);
    seasons.push(await ingestSeason(league, state, runId, staged));
  }

  // Guards that answer "would promoting this leave us with less than we have?"
  // Kept apart from the rest so `--allow-shrink` can downgrade exactly these
  // and nothing else.
  const shrinkProblems: string[] = [];
  for (const season of seasons) {
    await carryForwardMissing(season);
    // Floors the watermark, so it has to run before the manifest is written.
    shrinkProblems.push(...(await enforceWatermarkFloor(season, allowShrink)));
    await writeJson(
      path.join(season.stagedDir, "manifest.json"),
      season.manifest,
    );
  }

  const head = chain[0];
  if (!head) throw new Error("league chain empty");

  const snapshotDate = todayUtc();
  const stagedSnapshot = path.join(
    stagingDir,
    "values-snapshots",
    `${snapshotDate}.json`,
  );
  const snapshot = await snapshotFantasyCalc(head.league, stagedSnapshot);

  const stagedPlayers = path.join(stagingDir, "players.json");
  const stagedPlayersMeta = path.join(stagingDir, "players-meta.json");
  const players = await refreshPlayers(stagedPlayers, stagedPlayersMeta);

  // --- validate everything staged, before a single live file moves ---------
  const problems: string[] = [];
  for (const season of seasons) {
    problems.push(...validateSeason(season));
    // The bytes about to become live, against the bytes that are live now.
    // Every other check here reads in-memory objects, which is how an empty
    // upstream answer once passed validation and deleted a season on rename.
    shrinkProblems.push(...(await validateAgainstLive(season)));
  }
  if (snapshot.dynasty.length === 0) {
    problems.push("FantasyCalc dynasty list is empty");
  }
  if (snapshot.redraft.length === 0) {
    problems.push("FantasyCalc redraft list is empty");
  }
  if (players.fetched && players.count === 0) {
    problems.push("/players/nfl returned no players");
  }
  if (players.fetched && players.count > 0 && players.count < 1000) {
    console.log(
      `\n[players] only ${players.count} players returned; that is unusually small`,
    );
  }
  if (rateLimitedFetches >= MAX_RATE_LIMITED_FETCHES) {
    problems.push(
      `${rateLimitedFetches} fetch(es) exhausted their retries against Sleeper rate limiting; what this run staged is partial, so it is not fit to replace the live cache`,
    );
  } else if (rateLimitedFetches > 0) {
    console.log(
      `\n[rate-limit] ${rateLimitedFetches} fetch(es) gave up to 429s (abort threshold ${MAX_RATE_LIMITED_FETCHES})`,
    );
  }

  if (shrinkProblems.length > 0) {
    if (allowShrink) {
      console.error(
        `\n[allow-shrink] ${shrinkProblems.length} data-loss guard(s) overridden by request:`,
      );
      for (const p of shrinkProblems) console.error(`  - ${p}`);
    } else {
      problems.push(...shrinkProblems);
    }
  }

  if (problems.length > 0) {
    console.error(`\nvalidation failed - nothing promoted, live data intact:`);
    for (const p of problems) console.error(`  - ${p}`);
    if (!allowShrink && shrinkProblems.length > 0) {
      console.error(
        `\nIf upstream really did drop this data and the cache should shrink to match,` +
          ` rerun with --allow-shrink. Check the live files first — this is the only` +
          ` copy of them.`,
      );
    }
    throw new Error(`${problems.length} validation problem(s); refusing to promote`);
  }
  console.log(`\n[validate] ${seasons.length} season(s) ok`);

  // --- promote ------------------------------------------------------------
  const plans: Promotion[] = seasons.map((season) => ({
    label: `league-cache/${season.season}`,
    staged: season.stagedDir,
    live: season.liveDir,
    backup: path.join(BACKUP_ROOT, runId, `league-cache-${season.season}`),
  }));
  plans.push({
    label: `values-snapshots/${snapshotDate}.json`,
    staged: stagedSnapshot,
    live: path.join(SNAPSHOT_DIR, `${snapshotDate}.json`),
    backup: path.join(BACKUP_ROOT, runId, `values-snapshot-${snapshotDate}.json`),
  });
  if (players.fetched) {
    plans.push({
      label: "players.json",
      staged: stagedPlayers,
      live: PLAYERS_PATH,
      backup: path.join(BACKUP_ROOT, runId, "players.json"),
    });
    plans.push({
      label: "players-meta.json",
      staged: stagedPlayersMeta,
      live: PLAYERS_META_PATH,
      backup: path.join(BACKUP_ROOT, runId, "players-meta.json"),
    });
  }

  await promoteAll(runId, plans);

  await rm(stagingDir, { recursive: true, force: true });
  await removeIfEmpty(STAGING_ROOT);
  await removeIfEmpty(BACKUP_ROOT);

  summarizeSamples(snapshot);

  console.log(`\ndone.`);
}

// Only run when executed directly (`npm run ingest` / `tsx scripts/ingest.ts`).
// The promotion/recovery pair is imported by its test, and an import that
// kicked off a real ingest would fetch the live league mid-test-run.
const isDirectRun =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const argv = process.argv.slice(2);
  main(resolveRunId(argv), resolveAllowShrink(argv)).catch((err: unknown) => {
    console.error(`\nFAIL:`, err);
    process.exit(1);
  });
}
