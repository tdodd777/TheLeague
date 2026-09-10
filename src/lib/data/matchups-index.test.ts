import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { before, describe, it } from "node:test";

/**
 * Same fixture strategy as `weekly.test.ts`: `src/lib/data/paths.ts` resolves
 * the cache directory from `process.cwd()` at import time, so build a
 * throwaway cache in a temp directory, chdir into it, and only then import the
 * module under test. The test runner gives each file its own process, so the
 * chdir cannot leak into another test file.
 */
type MatchupsIndexModule = typeof import("./matchups-index");

let matchupsIndex: MatchupsIndexModule | null = null;

function mod(): MatchupsIndexModule {
  assert.ok(matchupsIndex, "matchups-index module was not loaded");
  return matchupsIndex;
}

const ROSTER_IDS = [1, 2, 3, 4] as const;

/** A week where Sleeper assigned pairings: two games across four rosters. */
function pairedWeek(week: number): unknown[] {
  return ROSTER_IDS.map((rosterId) => ({
    matchup_id: Math.ceil(rosterId / 2),
    roster_id: rosterId,
    points: 100 + week + rosterId,
  }));
}

/**
 * A ghost week: the file exists and carries points, but every `matchup_id` is
 * null because the league never scheduled any games (2025's week 18 on disk).
 */
function ghostWeek(week: number): unknown[] {
  return ROSTER_IDS.map((rosterId) => ({
    matchup_id: null,
    roster_id: rosterId,
    points: 100 + week + rosterId,
  }));
}

/**
 * A schedule stub: Sleeper publishes the whole regular season the moment a
 * league goes `in_season`, so the file has pairings but nobody has scored.
 */
function stubWeek(): unknown[] {
  return ROSTER_IDS.map((rosterId) => ({
    matchup_id: Math.ceil(rosterId / 2),
    roster_id: rosterId,
    points: 0,
  }));
}

const FIXTURES: ReadonlyArray<{
  season: string;
  weeks: ReadonlyArray<{ week: number; rows: unknown[] }>;
}> = [
  // Newest season on disk, in_season but unplayed: two schedule stubs and a
  // ghost week 18 the league never scheduled.
  {
    season: "2026",
    weeks: [
      { week: 1, rows: stubWeek() },
      { week: 2, rows: stubWeek() },
      { week: 18, rows: ghostWeek(18) },
    ],
  },
  // Live-ish season: two real weeks, then a trailing ghost week 3.
  {
    season: "2025",
    weeks: [
      { week: 1, rows: pairedWeek(1) },
      { week: 2, rows: pairedWeek(2) },
      { week: 3, rows: ghostWeek(3) },
    ],
  },
];

async function buildFixtures(root: string): Promise<void> {
  for (const fx of FIXTURES) {
    const dir = path.join(root, "data", "league-cache", fx.season);
    await mkdir(dir, { recursive: true });
    for (const { week, rows } of fx.weeks) {
      await writeFile(
        path.join(dir, `matchups-${String(week).padStart(2, "0")}.json`),
        JSON.stringify(rows),
      );
    }
  }
}

before(async () => {
  const root = await mkdtemp(path.join(tmpdir(), "league-matchups-index-"));
  await buildFixtures(root);
  const previous = process.cwd();
  process.chdir(root);
  try {
    matchupsIndex = await import("./matchups-index");
  } finally {
    // The module has already captured the fixture root; put the process back.
    process.chdir(previous);
  }
});

describe("latestCachedMatchupWeek", () => {
  it("skips stub and ghost weeks, landing on the latest week anyone actually played", async () => {
    // 2026 is all schedule stubs plus a ghost week, and 2025's week 3 is a
    // ghost too, so the newest week where anyone actually played is 2025
    // week 2. This is the regression that sent /matchups to 2026 week 18's
    // 0.00 to 0.00 scoreboard.
    const latest = await mod().latestCachedMatchupWeek();
    assert.deepEqual(latest, { season: "2025", week: 2 });
  });
});

describe("listCachedMatchupWeeks", () => {
  it("lists played weeks only, so static params, the week nav, and the palette never point at an empty scoreboard", async () => {
    const all = await mod().listCachedMatchupWeeks();
    const bySeason = new Map(all.map((s) => [s.season, s.weeks]));
    assert.deepEqual(bySeason.get("2026"), []);
    assert.deepEqual(bySeason.get("2025"), [1, 2]);
  });
});
