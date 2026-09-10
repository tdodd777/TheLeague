"use client";

import { useEffect, useRef, useState } from "react";

import type {
  SleeperDraft,
  SleeperDraftPick,
  SleeperTradedPick,
} from "@/lib/sleeper";

interface UseLiveDraftOptions {
  draftId: string;
  /**
   * Pass false when the caller already knows it will render nothing. The hook
   * then does no network work at all, so a suppressed banner cannot duplicate
   * the draft room's poll loop.
   */
  enabled?: boolean;
}

export interface LiveDraftState {
  draft: SleeperDraft | null;
  picks: SleeperDraftPick[] | null;
  tradedPicks: SleeperTradedPick[] | null;
  lastUpdated: number | null;
  error: string | null;
}

const SLEEPER = "https://api.sleeper.app/v1";

/** Base cadence while picks are actively coming in. */
const DRAFTING_MS = 10_000;
/**
 * Ceiling for the backoff applied when the picks payload stops changing. The
 * league runs slow drafts (the pick timer is hours, not seconds), so a lull
 * eases polling off rather than hammering Sleeper all afternoon. Never a
 * stop: cadence snaps back the moment a pick lands or the tab comes back.
 */
const DRAFTING_MAX_MS = 2 * 60_000;
const BACKOFF_FACTOR = 2;
/** A paused draft only needs to notice the unpause. */
const PAUSED_MS = 60_000;
/** Pre-draft, starting within the hour (or no start time published). */
const PRE_NEAR_MS = 60_000;
/** Pre-draft, start still hours away — a tab left open should still flip. */
const PRE_FAR_MS = 10 * 60_000;
/** How close "starting soon" is, against the draft's own start_time. */
const PRE_NEAR_WINDOW_MS = 60 * 60_000;
/** Retry cadence after a failed poll. */
const RETRY_MS = 30_000;
/** Floor between refreshes triggered by visibility or focus. */
const RESUME_FLOOR_MS = 5_000;

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${SLEEPER}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`draft ${res.status} on ${path}`);
  return (await res.json()) as T;
}

/**
 * Live draft polling, straight from the browser to Sleeper — the site is
 * statically built, so during a draft the cached pages are hours behind and
 * this hook is the only source of truth.
 *
 * Each tick reads the draft detail (status, order), and once the draft is out
 * of pre_draft also reads the picks and the traded-picks ledger. Cadence
 * follows the status: minutes while waiting for the room to open, seconds
 * while picks are coming in (easing off through a lull), and a full stop once
 * the draft completes — a finished draft never changes again, so the last
 * payload is simply kept.
 */
export function useLiveDraft({
  draftId,
  enabled = true,
}: UseLiveDraftOptions): LiveDraftState {
  const [draft, setDraft] = useState<SleeperDraft | null>(null);
  const [picks, setPicks] = useState<SleeperDraftPick[] | null>(null);
  const [tradedPicks, setTradedPicks] = useState<SleeperTradedPick[] | null>(
    null,
  );
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let inFlight = false;
    let done = false;
    let lastPicksPayload: string | null = null;
    let backoffMs = DRAFTING_MS;
    let lastPullAt = 0;

    function clearTimer(): void {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }

    /** Next delay for a healthy poll, from the status we just saw. */
    function cadence(d: SleeperDraft, picksChanged: boolean): number {
      if (d.status === "drafting") {
        backoffMs = picksChanged
          ? DRAFTING_MS
          : Math.min(backoffMs * BACKOFF_FACTOR, DRAFTING_MAX_MS);
        return backoffMs;
      }
      backoffMs = DRAFTING_MS;
      if (d.status === "paused") return PAUSED_MS;
      // pre_draft: how close is the scheduled start?
      const startsSoon =
        d.start_time === null ||
        d.start_time - Date.now() < PRE_NEAR_WINDOW_MS;
      return startsSoon ? PRE_NEAR_MS : PRE_FAR_MS;
    }

    async function pull(): Promise<number | null> {
      if (inFlight || done) return null;
      inFlight = true;
      try {
        const d = await getJson<SleeperDraft>(`/draft/${draftId}`);
        if (cancelled) return null;
        setDraft(d);

        let picksChanged = false;
        if (d.status !== "pre_draft") {
          const [picksRes, tradedRes] = await Promise.all([
            fetch(`${SLEEPER}/draft/${draftId}/picks`, { cache: "no-store" }),
            getJson<SleeperTradedPick[]>(`/draft/${draftId}/traded_picks`),
          ]);
          if (!picksRes.ok) throw new Error(`draft picks ${picksRes.status}`);
          const body = await picksRes.text();
          if (cancelled) return null;
          if (body !== lastPicksPayload) {
            lastPicksPayload = body;
            picksChanged = true;
            const parsed = (JSON.parse(body) as SleeperDraftPick[])
              .slice()
              .sort((a, b) => a.pick_no - b.pick_no);
            setPicks(parsed);
          }
          setTradedPicks(tradedRes);
        }

        setLastUpdated(Date.now());
        setError(null);
        if (d.status === "complete") {
          // Final board is in hand; nothing left to poll.
          done = true;
          return null;
        }
        return cadence(d, picksChanged);
      } catch (err) {
        if (cancelled) return null;
        // Keep the last known payload on screen; a dropped request is not
        // "the draft ended".
        setError(err instanceof Error ? err.message : String(err));
        return RETRY_MS;
      } finally {
        lastPullAt = Date.now();
        inFlight = false;
      }
    }

    // Always cancels the pending timer first, so overlapping resume triggers
    // (visibilitychange plus focus) can never leave two loops running.
    function schedule(delay: number | null): void {
      if (cancelled || done || delay === null) return;
      clearTimer();
      timerRef.current = window.setTimeout(() => {
        void tick();
      }, delay);
    }

    async function tick(): Promise<void> {
      if (cancelled || done) return;
      if (document.hidden) {
        // Hidden tab: skip the request but keep the loop alive so the next
        // visible tick is immediate rather than a cold start.
        schedule(RETRY_MS);
        return;
      }
      schedule(await pull());
    }

    function resume(): void {
      if (cancelled || done || document.hidden) return;
      // Someone is looking again. Drop any backoff and refresh right away.
      backoffMs = DRAFTING_MS;
      if (Date.now() - lastPullAt < RESUME_FLOOR_MS) return;
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
  }, [draftId, enabled]);

  return { draft, picks, tradedPicks, lastUpdated, error };
}
