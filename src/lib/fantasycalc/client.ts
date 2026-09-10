import type { SleeperLeague } from "@/lib/sleeper/types";
import type { FantasyCalcEntry, FantasyCalcParams } from "./types";

const BASE = "https://api.fantasycalc.com/values/current";

/** Per-attempt request timeout. */
const DEFAULT_TIMEOUT_MS = 15_000;
/** Total attempts per request, including the first. */
const MAX_ATTEMPTS = 3;
/** First retry waits ~250-500ms, second ~500-1000ms. */
const BASE_BACKOFF_MS = 500;
/** Ceiling on any single wait, including a server-sent Retry-After. */
const MAX_BACKOFF_MS = 30_000;
/** How long we will wait when the server itself asks. See `retryAfterMs`. */
const MAX_RETRY_AFTER_MS = 120_000;

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

export interface FetchValuesOptions {
  signal?: AbortSignal;
  /** Per-attempt timeout override. Defaults to 15s. */
  timeoutMs?: number;
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

/**
 * 429 is rate limiting and 5xx is the server having a bad day: both are worth
 * a second look. Every other status (404 above all) is an answer, not a
 * failure — retrying it only delays the real error.
 */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Exponential backoff, jittered across the lower half of each step. */
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
 * Returns `"too-long"` rather than clamping down to our own backoff ceiling:
 * a server asking for 120s that we retry at 30s just earns a second 429.
 * Mirrors the same rule in `src/lib/sleeper/client.ts`.
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
 * working in older browsers.
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

export async function fetchValues(
  params: FantasyCalcParams,
  opts: FetchValuesOptions = {},
): Promise<FantasyCalcEntry[]> {
  const url = buildUrl(params);
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
      if (res.ok) return (await res.json()) as FantasyCalcEntry[];
      lastError = new FantasyCalcApiError(
        res.status,
        url,
        `FantasyCalc ${res.status} ${res.statusText}`,
      );
      if (!isRetryableStatus(res.status)) break;
      const asked = retryAfterMs(res);
      // Longer than we will hold the run open; retrying sooner earns another 429.
      if (asked === "too-long") break;
      waitMs = asked ?? backoffMs(attempt);
    } catch (err) {
      // A caller cancelling is a decision, not a transient failure.
      if (opts.signal?.aborted) throw err;
      lastError = err instanceof Error ? err : new Error(String(err));
      waitMs = backoffMs(attempt);
    } finally {
      link.release();
    }
  }

  throw (
    lastError ?? new FantasyCalcApiError(0, url, `FantasyCalc request failed`)
  );
}

/**
 * TEP correction multiplier. FantasyCalc's API does not accept a TEP param,
 * so when a league has bonus_rec_te > 0 we approximate with this multiplier
 * applied to TE values post-fetch. Per RANKINGS.md §4.
 */
export function tepMultiplier(bonusRecTe: number): number {
  if (!Number.isFinite(bonusRecTe) || bonusRecTe <= 0) return 1;
  return 1 + bonusRecTe * 0.5;
}
