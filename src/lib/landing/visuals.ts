/**
 * Data for the home page charts. Three pictures, each with one sentence:
 * this week's projected lineups league-wide, the contender quadrant, and
 * the 30-day swing in dynasty value for every roster. Each builder is
 * best-effort and returns null rather than breaking the page.
 */

import { getCurrentLeague, getManagers } from "@/lib/data";
import { isTrendSuppressed } from "@/lib/rankings/constants";
import { buildDynastyRankings } from "@/lib/rankings/engine";
import { buildQuadrant, type QuadrantData } from "@/lib/rankings/quadrant";
import { loadWeekStrength } from "@/lib/rankings/week-strength";
import type { Manager } from "@/lib/types";

export interface BarRow {
  manager: Manager;
  value: number;
}

export interface WeekProjections {
  week: number;
  /** Sorted high to low. */
  rows: BarRow[];
  takeaway: string;
}

export interface ValueSwings {
  snapshotDate: string;
  /** Sorted rising to falling. */
  rows: BarRow[];
  takeaway: string;
}

export interface HomeVisuals {
  week: WeekProjections | null;
  quadrant: (QuadrantData & { takeaway: string }) | null;
  swings: ValueSwings | null;
}

function whole(n: number): string {
  return Math.round(Math.abs(n)).toLocaleString("en-US");
}

async function attempt<T>(build: () => Promise<T | null>): Promise<T | null> {
  try {
    return await build();
  } catch {
    return null;
  }
}

async function weekProjections(season: string): Promise<WeekProjections | null> {
  const week = await loadWeekStrength();
  if (!week || week.sources.length < 2) return null;
  const managers = await getManagers(season);
  const rows = week.sources
    .map((s) => {
      const manager = managers.byRosterId.get(s.rosterId);
      return manager ? { manager, value: s.total } : null;
    })
    .filter((r): r is BarRow => r !== null)
    .sort((a, b) => b.value - a.value);
  const top = rows[0];
  const next = rows[1];
  if (!top || !next) return null;
  return {
    week: week.week,
    rows,
    takeaway: `${top.manager.displayName.trim()} projects ${(top.value - next.value).toFixed(1)} clear of ${next.manager.displayName.trim()}, from the lineups actually set.`,
  };
}

async function quadrant(): Promise<(QuadrantData & { takeaway: string }) | null> {
  const data = await buildQuadrant();
  if (data.combined.length === 0) return null;
  const contenders = data.buckets.Contender.map((c) => c.manager.displayName.trim());
  const takeaway =
    contenders.length > 0
      ? `Strong now and later: ${contenders.join(", ")}.`
      : "Nobody is above the median on both axes.";
  return { ...data, takeaway };
}

async function valueSwings(): Promise<ValueSwings | null> {
  const month = new Date().getUTCMonth() + 1;
  if (isTrendSuppressed(month)) return null;
  const dynasty = await buildDynastyRankings();
  const rows = dynasty.rosters
    .map((r) => ({ manager: r.manager, value: r.trend30Day }))
    .filter((r) => Number.isFinite(r.value))
    .sort((a, b) => b.value - a.value);
  if (rows.length === 0 || rows.every((r) => r.value === 0)) return null;
  const biggest = [...rows].sort((a, b) => Math.abs(b.value) - Math.abs(a.value))[0]!;
  return {
    snapshotDate: dynasty.snapshotDate,
    rows,
    takeaway: `${biggest.manager.displayName.trim()} ${biggest.value >= 0 ? "gained" : "lost"} the most: ${whole(biggest.value)} in starter value over 30 days.`,
  };
}

export async function getHomeVisuals(): Promise<HomeVisuals> {
  const { season } = await getCurrentLeague();
  const [week, quad, swings] = await Promise.all([
    attempt(() => weekProjections(season)),
    attempt(quadrant),
    attempt(valueSwings),
  ]);
  return { week, quadrant: quad, swings };
}
