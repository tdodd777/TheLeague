/**
 * The contender quadrant: every roster placed by season power (x) against
 * dynasty value (y), split at the league medians. Shared by the rankings
 * quadrant page and the home page chart so both draw the same picture.
 */

import { trendColor } from "@/components/rankings/palette";
import type { ScatterPoint } from "@/components/ui";

import { isTrendSuppressed } from "./constants";
import { buildDynastyRankings, buildSeasonRankings } from "./engine";
import type { RosterValueBreakdown, SeasonPowerBreakdown } from "./types";

export type QuadrantName = "Contender" | "Win-Now" | "Rebuilder" | "Stuck";

export interface QuadrantEntry {
  rosterId: number;
  manager: SeasonPowerBreakdown["manager"];
  seasonPower: number;
  dynastyTotal: number;
  starterAge: number | null;
  trend30d: number;
  username: string;
}

export interface QuadrantData {
  combined: QuadrantEntry[];
  points: ScatterPoint[];
  xMedian: number;
  yMedian: number;
  /** Off-season months where the 30-day trend is noise, so bubbles go accent. */
  trendSuppressed: boolean;
  buckets: Record<QuadrantName, QuadrantEntry[]>;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  return sorted[mid] ?? 0;
}

export async function buildQuadrant(): Promise<QuadrantData> {
  const [{ power }, dynasty] = await Promise.all([
    buildSeasonRankings(),
    buildDynastyRankings(),
  ]);

  const dynastyByRoster = new Map<number, RosterValueBreakdown>(
    dynasty.rosters.map((r) => [r.rosterId, r] as const),
  );

  const combined: QuadrantEntry[] = power
    .map((p) => {
      const d = dynastyByRoster.get(p.rosterId);
      if (!d) return null;
      return {
        rosterId: p.rosterId,
        manager: p.manager,
        username: p.manager.username,
        seasonPower: p.total,
        dynastyTotal: d.total,
        starterAge: d.starterAvgAge,
        trend30d: d.trend30Day,
      };
    })
    .filter((x): x is QuadrantEntry => x !== null);

  const xMedian = median(combined.map((c) => c.seasonPower));
  const yMedian = median(combined.map((c) => c.dynastyTotal));
  const ages = combined
    .map((c) => c.starterAge ?? 28)
    .filter((a) => Number.isFinite(a));
  const minAge = Math.min(...ages);
  const maxAge = Math.max(...ages);
  const ageRange = maxAge - minAge || 1;

  const month = new Date().getUTCMonth() + 1;
  const trendSuppressed = isTrendSuppressed(month);

  const points: ScatterPoint[] = combined.map((c) => {
    // Bubble size: smaller = younger (better). Scale 5 → 14 px.
    const ageNorm = c.starterAge !== null ? (c.starterAge - minAge) / ageRange : 0.5;
    const r = 5 + ageNorm * 9;
    const color = trendSuppressed ? "var(--accent-primary)" : trendColor(c.trend30d);
    return {
      id: String(c.rosterId),
      x: c.seasonPower,
      y: c.dynastyTotal,
      r,
      color,
      label: c.username,
    };
  });

  const buckets: Record<QuadrantName, QuadrantEntry[]> = {
    Contender: [],
    "Win-Now": [],
    Rebuilder: [],
    Stuck: [],
  };
  for (const c of combined) {
    const sa = c.seasonPower >= xMedian;
    const da = c.dynastyTotal >= yMedian;
    const name: QuadrantName = sa && da ? "Contender" : sa ? "Win-Now" : da ? "Rebuilder" : "Stuck";
    buckets[name].push(c);
  }

  return { combined, points, xMedian, yMedian, trendSuppressed, buckets };
}
