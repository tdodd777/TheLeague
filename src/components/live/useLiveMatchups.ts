"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type {
  SleeperLeague,
  SleeperMatchup,
  SleeperNflState,
} from "@/lib/sleeper";

interface UseLiveMatchupsOptions {
  leagueId: string;
  intervalMs?: number;
  /**
   * Pass false when the caller already knows it will render nothing. The hook
   * then does no network work at all, so a component that is about to bail out
   * cannot duplicate another component's poll loop.
   */
  enabled?: boolean;
}

export type LiveMode =
  | { phase: "unknown" }
  | { phase: "inactive" }
  | { phase: "active"; week: number };

export interface LiveMatchupsState {
  mode: LiveMode;
  matchups: SleeperMatchup[] | null;
  lastUpdated: number | null;
  error: string | null;
}

const SLEEPER = "https://api.sleeper.app/v1";

/** How often we re-ask Sleeper which week it is while the tab stays open. */
const STATE_REFRESH_MS = 10 * 60_000;
/**
 * Retry cadence after a failed week check. The healthy cadence is ten minutes,
 * which is far too long to sit on a dropped request: during a live game that
 * is ten minutes of frozen scores.
 */
const STATE_RETRY_MS = 30_000;
/** Floor between week re-checks triggered by visibility or focus. */
const STATE_RECHECK_FLOOR_MS = 60_000;
/** Floor between matchup refreshes triggered by visibility or focus. */
const RESUME_FLOOR_MS = 5_000;
/** How often we re-check the wall clock against the game window. */
const WINDOW_CHECK_MS = 60_000;
/** Ceiling for the backoff applied when the payload stops changing. */
const MAX_INTERVAL_MS = 5 * 60_000;
const BACKOFF_FACTOR = 2;

/** Result of the season/week half of the live check. */
type WeekGate =
  | { phase: "unknown" }
  | { phase: "off" }
  | { phase: "on"; week: number };

const ET_WEEKDAY: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const ET_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function easternClock(
  now: Date,
): { weekday: number; minuteOfDay: number } | null {
  let weekday: number | undefined;
  let hour: number | undefined;
  let minute: number | undefined;
  for (const part of ET_FORMAT.formatToParts(now)) {
    if (part.type === "weekday") weekday = ET_WEEKDAY[part.value];
    // Some ICU builds emit "24" for midnight under hour12: false.
    else if (part.type === "hour") hour = Number(part.value) % 24;
    else if (part.type === "minute") minute = Number(part.value);
  }
  if (weekday === undefined || hour === undefined || minute === undefined) {
    return null;
  }
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return { weekday, minuteOfDay: hour * 60 + minute };
}

/**
 * The NFL's actual kickoff slots, in ET, rather than whole days. Days are too
 * coarse: "Thursday through Tuesday" keeps the site claiming Live for all of
 * Friday and all of Saturday, when every game has been final since Thursday
 * night. Each slot runs from its earliest kickoff to the end of the day (or,
 * for the two overruns, from midnight to the hour the previous night's game
 * can still be running).
 */
function inGameWindow(now: Date): boolean {
  const et = easternClock(now);
  // If the timezone cannot be resolved, do not suppress live mode.
  if (!et) return true;
  const { weekday, minuteOfDay } = et;
  if (weekday === 4) return minuteOfDay >= 20 * 60; // Thu, TNF kickoff onward
  if (weekday === 0) return minuteOfDay >= 13 * 60; // Sun, early window onward
  // Mon: Sunday-night overrun, then Monday night.
  if (weekday === 1) return minuteOfDay < 60 || minuteOfDay >= 20 * 60;
  if (weekday === 2) return minuteOfDay < 2 * 60; // Tue, Monday-night overrun
  if (weekday === 6) return minuteOfDay >= 13 * 60; // Sat, late-season slate
  return false; // Wed, Fri
}

function readLeagueWeek(league: SleeperLeague): number | null {
  const leg = league.settings.leg;
  return Number.isFinite(leg) && leg > 0 ? leg : null;
}

/**
 * The half of the season gate that needs only `/state/nfl`. Checking it before
 * the league request keeps the year-round cost of a page view at one fetch:
 * outside the regular season the league payload is never read.
 */
function stateGateOpen(state: SleeperNflState): boolean {
  return state.season_type === "regular" && state.week > 0;
}

function gateFrom(state: SleeperNflState, league: SleeperLeague): WeekGate {
  if (!stateGateOpen(state)) return { phase: "off" };
  const leagueWeek = readLeagueWeek(league);
  if (leagueWeek === null) return { phase: "off" };
  // Equality covers both directions: the NFL week having advanced past the
  // league week (nothing left to poll) and the league not having rolled over
  // yet (the matchup payload would be the previous week's finals).
  if (state.week !== leagueWeek) return { phase: "off" };
  return { phase: "on", week: state.week };
}

/**
 * Live matchup polling. The "is it live" decision is an approximation, on
 * purpose, because an exact one is not available.
 *
 * Sleeper exposes no matchup-completion or game-status field anywhere in the
 * endpoints this site uses. `/state/nfl` gives a week and a season type, and
 * `/league/{id}/matchups/{week}` gives points with no notion of whether a game
 * is in progress, at halftime, or final. There is no way to ask "are the games
 * over". So we approximate with three gates:
 *
 *  1. Season gate. `season_type` must be "regular" and the NFL week must equal
 *     the league's own current week (`settings.leg`). Once the NFL week
 *     advances past the league week there is nothing left to poll and we stop.
 *  2. Clock gate. Now must fall inside one of the NFL's kickoff slots, in ET:
 *     Thursday from 20:00, Saturday and Sunday from 13:00, Monday from 20:00,
 *     plus the two late-night overruns (Monday until 01:00 for Sunday night,
 *     Tuesday until 02:00 for Monday night). Friday and Wednesday are never
 *     live. Slots rather than whole days: "Thursday through Tuesday" left the
 *     site claiming Live for all of Friday and all of Saturday with every game
 *     final since Thursday night, which is the same bug it was meant to fix.
 *  3. Payload backoff. Inside the window, two consecutive identical payloads
 *     are read as a scoring lull, and the interval lengthens exponentially up
 *     to five minutes. This is a slowdown and never a stop: cadence snaps back
 *     to normal the moment the payload changes, or the tab regains visibility
 *     or focus. A quiet stretch on Sunday evening must not kill live updates
 *     for the rest of the night.
 *
 * Known costs of the approximation. Games that start outside a slot will not
 * show as live. Naming the real ones, since the slots are deliberately tight:
 * Thanksgiving's 12:30 and 16:30 ET games (the Thursday slot opens at 20:00),
 * Christmas and other midweek holiday games, and any Saturday game kicking off
 * before 13:00. Those weeks fall back to cached scores until the next slot
 * opens. Going the other way, we keep polling for a couple of hours after the
 * last game of a slot goes final, because Sleeper exposes no "final" flag.
 * Both are accepted, but they are not symmetric: a stale "Live" badge on a day
 * with no football at all is worse than a missed one, so when in doubt the
 * window stays closed.
 */
export function useLiveMatchups({
  leagueId,
  intervalMs = 30_000,
  enabled = true,
}: UseLiveMatchupsOptions): LiveMatchupsState {
  const [gate, setGate] = useState<WeekGate>({ phase: "unknown" });
  const [inWindow, setInWindow] = useState<boolean>(true);
  const [matchups, setMatchups] = useState<SleeperMatchup[] | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  // Season gate: which week is the NFL on, and is it the week our league is
  // scoring? Re-checked on a slow timer and whenever the tab comes back, so a
  // page left open overnight notices the week rolling over.
  useEffect(() => {
    if (!enabled) {
      setGate({ phase: "unknown" });
      return;
    }
    let cancelled = false;
    let timer: number | null = null;
    let lastDetectAt = 0;
    let inFlight = false;

    /** Resolves false when the check failed, so the caller can retry sooner. */
    async function detect(): Promise<boolean> {
      // A check is already running; it will schedule the next one itself.
      if (inFlight) return true;
      inFlight = true;
      try {
        const stateRes = await fetch(`${SLEEPER}/state/nfl`, {
          cache: "no-store",
        });
        if (!stateRes.ok) throw new Error(`state ${stateRes.status}`);
        const state = (await stateRes.json()) as SleeperNflState;
        if (cancelled) return true;
        // Sequential, not parallel: the gate below short-circuits on season
        // type and week, and for most of the year it never reads the league.
        // LiveBanner is in the root layout, so a wasted league fetch here is a
        // wasted fetch on every page view of the site.
        if (!stateGateOpen(state)) {
          setGate({ phase: "off" });
          setError(null);
          return true;
        }
        const leagueRes = await fetch(`${SLEEPER}/league/${leagueId}`, {
          cache: "no-store",
        });
        if (!leagueRes.ok) throw new Error(`league ${leagueRes.status}`);
        const league = (await leagueRes.json()) as SleeperLeague;
        if (cancelled) return true;
        setGate(gateFrom(state, league));
        setError(null);
        return true;
      } catch (err) {
        if (cancelled) return true;
        // A dropped request is not "the season is over". Forcing the gate off
        // here would null activeWeek and tear down the matchup loop mid-game,
        // and it would hide the error, because the banner only reports one
        // while live mode is active. Keep the last known gate, show the
        // failure, and come back in STATE_RETRY_MS.
        setError(err instanceof Error ? err.message : String(err));
        return false;
      } finally {
        lastDetectAt = Date.now();
        inFlight = false;
      }
    }

    function schedule(ok: boolean): void {
      if (cancelled) return;
      if (timer !== null) window.clearTimeout(timer);
      const delay = ok ? STATE_REFRESH_MS : STATE_RETRY_MS;
      timer = window.setTimeout(() => {
        void detect().then(schedule);
      }, delay);
    }

    function recheck(): void {
      if (document.hidden) return;
      // Tab switching fires visibilitychange and focus together, and a phone
      // user does that constantly. The week does not change that fast.
      if (Date.now() - lastDetectAt < STATE_RECHECK_FLOOR_MS) return;
      void detect().then(schedule);
    }

    void detect().then(schedule);
    document.addEventListener("visibilitychange", recheck);
    window.addEventListener("focus", recheck);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", recheck);
      window.removeEventListener("focus", recheck);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [enabled, leagueId]);

  // Clock gate. Kept out of the first render so the server and the client
  // agree on the initial markup; the gate above is "unknown" until the first
  // fetch lands anyway, so nothing renders as live before this settles.
  useEffect(() => {
    if (!enabled) return;
    function sync(): void {
      setInWindow(inGameWindow(new Date()));
    }
    sync();
    const id = window.setInterval(sync, WINDOW_CHECK_MS);
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("focus", sync);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("focus", sync);
    };
  }, [enabled]);

  const activeWeek =
    enabled && gate.phase === "on" && inWindow ? gate.week : null;

  useEffect(() => {
    if (activeWeek === null) return;
    const week = activeWeek;
    let cancelled = false;
    let delay = intervalMs;
    let lastPayload: string | null = null;
    let lastPullAt = 0;
    let inFlight = false;

    function clearTimer(): void {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }

    // Always cancels the pending timer first, so overlapping resume triggers
    // (visibilitychange plus focus) can never leave two loops running.
    function schedule(): void {
      if (cancelled) return;
      clearTimer();
      timerRef.current = window.setTimeout(() => {
        void tick();
      }, delay);
    }

    async function pull(): Promise<void> {
      if (inFlight) return;
      inFlight = true;
      try {
        const r = await fetch(`${SLEEPER}/league/${leagueId}/matchups/${week}`, {
          cache: "no-store",
        });
        if (!r.ok) throw new Error(`matchups ${r.status}`);
        const body = await r.text();
        if (cancelled) return;
        if (body === lastPayload) {
          // Nothing moved since the last poll. Ease off rather than stop, and
          // leave the rendered scores exactly as they are.
          delay = Math.min(delay * BACKOFF_FACTOR, MAX_INTERVAL_MS);
        } else {
          delay = intervalMs;
          lastPayload = body;
          setMatchups(JSON.parse(body) as SleeperMatchup[]);
        }
        setLastUpdated(Date.now());
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        lastPullAt = Date.now();
        inFlight = false;
      }
    }

    async function tick(): Promise<void> {
      if (cancelled) return;
      // Hidden tab: skip the request but keep the loop alive so the next
      // visible tick is immediate rather than a cold start.
      if (!document.hidden) await pull();
      schedule();
    }

    function resume(): void {
      if (cancelled || document.hidden) return;
      // Someone is looking again. Drop any backoff and refresh right away.
      delay = intervalMs;
      if (Date.now() - lastPullAt < RESUME_FLOOR_MS) {
        // visibilitychange and focus arrive together; one refresh is enough.
        schedule();
        return;
      }
      clearTimer();
      void pull().then(schedule);
    }

    void pull().then(schedule);
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", resume);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("focus", resume);
      clearTimer();
    };
  }, [activeWeek, leagueId, intervalMs]);

  const mode = useMemo<LiveMode>(() => {
    if (activeWeek !== null) return { phase: "active", week: activeWeek };
    if (gate.phase === "unknown") return { phase: "unknown" };
    return { phase: "inactive" };
  }, [activeWeek, gate.phase]);

  return { mode, matchups, lastUpdated, error };
}
