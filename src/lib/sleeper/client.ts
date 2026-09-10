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

/** Per-attempt request timeout. Sleeper answers in <1s; 15s means it is gone. */
const DEFAULT_TIMEOUT_MS = 15_000;
/** Total attempts per request, including the first. */
const MAX_ATTEMPTS = 3;
/** First retry waits ~250-500ms, second ~500-1000ms. */
const BASE_BACKOFF_MS = 500;
/** Ceiling on any wait we choose ourselves. */
const MAX_BACKOFF_MS = 30_000;
/**
 * How long we will actually wait when the *server* tells us to. Higher than our
 * own backoff ceiling on purpose: a server-sent `Retry-After` is an instruction,
 * not a suggestion, and honouring it is cheaper than a guaranteed second 429.
 * Beyond this we stop retrying rather than retry too early.
 */
const MAX_RETRY_AFTER_MS = 120_000;

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

export interface FetchOptions {
  signal?: AbortSignal;
  /**
   * Per-attempt timeout override. Defaults to 15s, which is right for every
   * endpoint except `/players/nfl` (~18 MB, needs a longer leash).
   */
  timeoutMs?: number;
}

/**
 * 429 is rate limiting and 5xx is the server having a bad day: both are worth
 * a second look. Every other status (404 above all) is an answer, not a
 * failure — retrying it just burns the run's budget and delays the real error.
 */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Exponential backoff, jittered across the lower half of each step so the
 * week-by-week fetches that run in parallel don't all retry on the same tick.
 */
function backoffMs(attempt: number): number {
  const ceiling = Math.min(
    BASE_BACKOFF_MS * 2 ** (attempt - 1),
    MAX_BACKOFF_MS,
  );
  return Math.round(ceiling / 2 + Math.random() * (ceiling / 2));
}

/**
 * Honour `Retry-After` (seconds or HTTP date) when the server sends one.
 *
 * Returns the wait, or `"too-long"` when the server asks for longer than we are
 * willing to hold the run open. Clamping that case DOWN to our own ceiling
 * would be worse than not retrying at all: a server saying "wait 120s" would be
 * retried at 30s, guaranteeing a second 429, burning an attempt and adding load
 * to something already asking us to back off. A floor is not a ceiling.
 */
function retryAfterMs(res: Response): number | "too-long" | null {
  const header = res.headers.get("retry-after");
  if (!header) return null;
  const seconds = Number(header);
  const ms = Number.isFinite(seconds) && seconds >= 0
    ? seconds * 1000
    : (() => {
        const at = Date.parse(header);
        return Number.isNaN(at) ? null : Math.max(at - Date.now(), 0);
      })();
  if (ms === null) return null;
  return ms > MAX_RETRY_AFTER_MS ? "too-long" : ms;
}

interface AttemptSignal {
  signal: AbortSignal;
  release: () => void;
}

/**
 * The signal for one attempt: a fresh timeout, plus the caller's signal when
 * there is one. Built by hand rather than with `AbortSignal.any` so this keeps
 * working in the browser (the live-scoring components call this client too).
 */
function attemptSignal(
  timeoutMs: number,
  external: AbortSignal | undefined,
): AttemptSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  const noop = (): void => {
    // nothing linked, nothing to unsubscribe
  };
  if (!external) return { signal: timeout, release: noop };

  const controller = new AbortController();
  if (external.aborted) {
    controller.abort(external.reason);
    return { signal: controller.signal, release: noop };
  }

  const onTimeout = (): void => {
    controller.abort(timeout.reason);
  };
  const onExternal = (): void => {
    controller.abort(external.reason);
  };
  timeout.addEventListener("abort", onTimeout, { once: true });
  external.addEventListener("abort", onExternal, { once: true });

  return {
    signal: controller.signal,
    release: () => {
      timeout.removeEventListener("abort", onTimeout);
      external.removeEventListener("abort", onExternal);
    },
  };
}

async function getJson<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  const url = `${BASE}${path}`;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let lastError: Error | null = null;
  let waitMs = 0;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    if (waitMs > 0) await sleep(waitMs);
    const link = attemptSignal(timeoutMs, opts.signal);
    try {
      const res = await fetch(url, {
        headers: { accept: "application/json" },
        signal: link.signal,
      });
      if (res.ok) return (await res.json()) as T;
      lastError = new SleeperApiError(
        res.status,
        url,
        `Sleeper ${res.status} ${res.statusText} on ${path}`,
      );
      if (!isRetryableStatus(res.status)) break;
      const asked = retryAfterMs(res);
      // The server wants a longer pause than this run is willing to hold open.
      // Retrying sooner would just earn another 429, so surface the error now.
      if (asked === "too-long") break;
      waitMs = asked ?? backoffMs(attempt);
    } catch (err) {
      // A caller cancelling is a decision, not a transient failure.
      if (opts.signal?.aborted) throw err;
      // Timeouts, socket resets and truncated bodies all land here.
      lastError = err instanceof Error ? err : new Error(String(err));
      waitMs = backoffMs(attempt);
    } finally {
      link.release();
    }
  }

  throw (
    lastError ?? new SleeperApiError(0, url, `Sleeper request failed on ${path}`)
  );
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
