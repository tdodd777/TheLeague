"use client";

import { useEffect, useRef, useState } from "react";

import type { SleeperMatchup, SleeperNflState } from "@/lib/sleeper";

interface UseLiveMatchupsOptions {
  leagueId: string;
  intervalMs?: number;
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

function isLive(state: SleeperNflState): boolean {
  return state.season_type === "regular" && state.week > 0;
}

export function useLiveMatchups({
  leagueId,
  intervalMs = 30_000,
}: UseLiveMatchupsOptions): LiveMatchupsState {
  const [mode, setMode] = useState<LiveMode>({ phase: "unknown" });
  const [matchups, setMatchups] = useState<SleeperMatchup[] | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function detect(): Promise<void> {
      try {
        const r = await fetch(`${SLEEPER}/state/nfl`, { cache: "no-store" });
        if (!r.ok) throw new Error(`state ${r.status}`);
        const s = (await r.json()) as SleeperNflState;
        if (cancelled) return;
        if (isLive(s)) {
          setMode({ phase: "active", week: s.week });
        } else {
          setMode({ phase: "inactive" });
        }
      } catch (err) {
        if (cancelled) return;
        setMode({ phase: "inactive" });
        setError(err instanceof Error ? err.message : String(err));
      }
    }

    void detect();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (mode.phase !== "active") return;
    const week = mode.week;
    let cancelled = false;

    async function pull(): Promise<void> {
      try {
        const r = await fetch(`${SLEEPER}/league/${leagueId}/matchups/${week}`, {
          cache: "no-store",
        });
        if (!r.ok) throw new Error(`matchups ${r.status}`);
        const data = (await r.json()) as SleeperMatchup[];
        if (cancelled) return;
        setMatchups(data);
        setLastUpdated(Date.now());
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      }
    }

    function schedule(): void {
      if (cancelled) return;
      if (document.hidden) {
        timerRef.current = window.setTimeout(schedule, intervalMs);
        return;
      }
      void pull().finally(() => {
        timerRef.current = window.setTimeout(schedule, intervalMs);
      });
    }

    void pull().then(() => schedule());

    function onVis(): void {
      if (!document.hidden) {
        void pull();
      }
    }
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [mode, leagueId, intervalMs]);

  return { mode, matchups, lastUpdated, error };
}
