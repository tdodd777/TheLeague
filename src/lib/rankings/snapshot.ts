import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { SNAPSHOT_DIR } from "@/lib/data/paths";

import type { ValueSnapshot } from "./types";

let cache: { date: string; snapshot: ValueSnapshot } | null = null;

export async function listSnapshotDates(): Promise<string[]> {
  const entries = await readdir(SNAPSHOT_DIR);
  return entries
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
}

export async function readSnapshot(date: string): Promise<ValueSnapshot> {
  const file = path.join(SNAPSHOT_DIR, `${date}.json`);
  const raw = await readFile(file, "utf8");
  return JSON.parse(raw) as ValueSnapshot;
}

/** Most recent snapshot. Cached per-process. */
export async function getLatestSnapshot(): Promise<{
  date: string;
  snapshot: ValueSnapshot;
}> {
  if (cache) return cache;
  const dates = await listSnapshotDates();
  const latest = dates[dates.length - 1];
  if (!latest) {
    throw new Error(
      "No FantasyCalc value snapshots found. Run `npm run ingest` to populate data/values-snapshots/.",
    );
  }
  const snapshot = await readSnapshot(latest);
  cache = { date: latest, snapshot };
  return cache;
}

/**
 * Resolve the snapshot closest in time to the given epoch-ms timestamp. Used
 * by the trade detail page to value a historical trade at "the values from
 * the time it happened" — falls forward to the earliest snapshot if the trade
 * predates the snapshot history.
 */
export async function getSnapshotClosestTo(
  ms: number,
): Promise<{ date: string; snapshot: ValueSnapshot }> {
  const dates = await listSnapshotDates();
  if (dates.length === 0) {
    throw new Error(
      "No FantasyCalc value snapshots found. Run `npm run ingest`.",
    );
  }
  const target = new Date(ms).getTime();
  let bestDate = dates[0]!;
  let bestDelta = Math.abs(target - new Date(bestDate).getTime());
  for (const d of dates) {
    const delta = Math.abs(target - new Date(d).getTime());
    if (delta < bestDelta) {
      bestDelta = delta;
      bestDate = d;
    }
  }
  return { date: bestDate, snapshot: await readSnapshot(bestDate) };
}
