import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { before, describe, it } from "node:test";

/**
 * `src/lib/data/paths.ts` resolves the cache directory from `process.cwd()` at
 * import time, so these tests build a throwaway cache in a temp directory,
 * chdir into it, and only then import the module under test. The real
 * `data/league-cache` and the ~18 MB `data/players.json` are never touched.
 * The test runner gives each file its own process, so the chdir cannot leak
 * into another test file.
 */
type WeeklyModule = typeof import("./weekly");

let weekly: WeeklyModule | null = null;

function mod(): WeeklyModule {
  assert.ok(weekly, "weekly module was not loaded");
  return weekly;
}

const ROSTER_IDS = [1, 2, 3, 4] as const;

interface SeasonFixture {
  season: string;
  /** Written to `league.json`. Omit to test the missing-setting fallback. */
  playoffWeekStart?: number;
  /** How many weeks of `matchups-NN.json` exist on disk. */
  weeksOnDisk: number;
  /** Written to `manifest.json`. Omit to leave the season without one. */
  manifest?: Record<string, unknown>;
}

const FIXTURES: readonly SeasonFixture[] = [
  // A finished season: 18 weeks of matchups cached, playoffs from week 15.
  { season: "2024", playoffWeekStart: 15, weeksOnDisk: 18 },
  // Same, but with a pre-v2 manifest whose completedThroughWeek meant the
  // ingest fetch ceiling rather than played regular-season weeks.
  {
    season: "2023",
    playoffWeekStart: 15,
    weeksOnDisk: 18,
    manifest: { season: "2023", completedThroughWeek: 18 },
  },
  // A FINISHED season carrying a v2 manifest: what every cached season looks
  // like the moment the refresh cron runs `ingest` once. `completedThroughWeek`
  // is defined as bounded by the regular season, so it sits at 14 here. If the
  // `all` scope is clamped by it, every playoff week silently disappears from
  // the record book. This fixture exists to make that failure loud.
  {
    season: "2022",
    playoffWeekStart: 15,
    weeksOnDisk: 18,
    manifest: {
      manifestVersion: 2,
      season: "2022",
      completedThroughWeek: 14,
      regularSeasonWeeks: 14,
      playoffWeekStart: 15,
    },
  },
  // A live season, nine weeks in the books, files cached past that point.
  {
    season: "2025",
    playoffWeekStart: 15,
    weeksOnDisk: 18,
    manifest: {
      manifestVersion: 2,
      season: "2025",
      completedThroughWeek: 9,
      regularSeasonWeeks: 14,
      playoffWeekStart: 15,
    },
  },
  // An old season cached without playoff_week_start on record.
  { season: "2019", weeksOnDisk: 18 },
];

async function buildFixtures(root: string): Promise<void> {
  for (const fx of FIXTURES) {
    const dir = path.join(root, "data", "league-cache", fx.season);
    await mkdir(dir, { recursive: true });

    const settings: Record<string, number> = { playoff_teams: 6 };
    if (fx.playoffWeekStart !== undefined) {
      settings["playoff_week_start"] = fx.playoffWeekStart;
    }
    await writeFile(
      path.join(dir, "league.json"),
      JSON.stringify({ season: fx.season, settings }),
    );

    if (fx.manifest) {
      await writeFile(
        path.join(dir, "manifest.json"),
        JSON.stringify(fx.manifest),
      );
    }

    for (let week = 1; week <= fx.weeksOnDisk; week += 1) {
      const rows = ROSTER_IDS.map((rosterId) => ({
        matchup_id: Math.ceil(rosterId / 2),
        roster_id: rosterId,
        points: 100 + week + rosterId,
      }));
      await writeFile(
        path.join(dir, `matchups-${String(week).padStart(2, "0")}.json`),
        JSON.stringify(rows),
      );
    }
  }
}

before(async () => {
  const root = await mkdtemp(path.join(tmpdir(), "league-weekly-"));
  await buildFixtures(root);
  const previous = process.cwd();
  process.chdir(root);
  try {
    weekly = await import("./weekly");
  } finally {
    // The module has already captured the fixture root; put the process back.
    process.chdir(previous);
  }
});

describe("getRegularSeasonEndWeek", () => {
  it("derives the last regular-season week from league settings", async () => {
    assert.equal(await mod().getRegularSeasonEndWeek("2024"), 14);
  });

  it("falls back to week 14 when the league has no playoff_week_start", async () => {
    assert.equal(await mod().getRegularSeasonEndWeek("2019"), 14);
  });
});

describe("getWeekBounds", () => {
  it("stops the regular-season scope before the playoffs", async () => {
    const bounds = await mod().getWeekBounds("2024", "regular");
    assert.equal(bounds.scope, "regular");
    assert.equal(bounds.lastWeek, 14);
    assert.equal(bounds.regularSeasonEndWeek, 14);
    assert.equal(bounds.completedThroughWeek, null);
  });

  it("lets the all scope run through week 18", async () => {
    const bounds = await mod().getWeekBounds("2024", "all");
    assert.equal(bounds.lastWeek, mod().MAX_MATCHUP_WEEK);
    assert.equal(bounds.lastWeek, 18);
  });

  it("treats a pre-v2 manifest as unknown rather than 18 played weeks", async () => {
    const bounds = await mod().getWeekBounds("2023", "regular");
    assert.equal(bounds.completedThroughWeek, null);
    assert.equal(bounds.lastWeek, 14);
  });

  it("keeps playoff weeks visible on a finished season that has a v2 manifest", async () => {
    // Regression guard. `completedThroughWeek` only ever tracks the regular
    // season, so using it to clamp the `all` scope capped a finished season at
    // week 14 and erased every playoff game from the records book, the moment
    // the cron committed its first manifest.
    const regular = await mod().getWeekBounds("2022", "regular");
    assert.equal(regular.completedThroughWeek, 14);
    assert.equal(regular.lastWeek, 14);

    const all = await mod().getWeekBounds("2022", "all");
    assert.equal(all.lastWeek, 18);
  });

  it("clamps a live season to the weeks that are actually finished", async () => {
    const regular = await mod().getWeekBounds("2025", "regular");
    assert.equal(regular.completedThroughWeek, 9);
    assert.equal(regular.lastWeek, 9);

    // The clamp binds under either scope: unplayed weeks are unplayed.
    const all = await mod().getWeekBounds("2025", "all");
    assert.equal(all.lastWeek, 9);
  });
});

describe("getWeeklyPointsByRoster", () => {
  it("counts 14 games per roster when 18 weeks are cached and playoffs start week 15", async () => {
    const byRoster = await mod().getWeeklyPointsByRoster("2024", {
      scope: "regular",
    });
    assert.equal(byRoster.size, ROSTER_IDS.length);
    for (const rosterId of ROSTER_IDS) {
      const weeks = byRoster.get(rosterId);
      assert.ok(weeks, `no weekly points for roster ${rosterId}`);
      assert.equal(weeks.length, 14);
    }
  });

  it("keeps the playoff weeks under the all scope", async () => {
    const byRoster = await mod().getWeeklyPointsByRoster("2024", {
      scope: "all",
    });
    for (const rosterId of ROSTER_IDS) {
      assert.equal(byRoster.get(rosterId)?.length, 18);
    }
  });

  it("returns points in week order", async () => {
    const byRoster = await mod().getWeeklyPointsByRoster("2024", {
      scope: "regular",
    });
    const roster1 = byRoster.get(1);
    assert.ok(roster1);
    // Fixture scores are 100 + week + rosterId.
    assert.equal(roster1[0], 102);
    assert.equal(roster1[13], 115);
  });

  it("does not read past the completed weeks of a live season", async () => {
    const byRoster = await mod().getWeeklyPointsByRoster("2025", {
      scope: "regular",
    });
    for (const rosterId of ROSTER_IDS) {
      assert.equal(byRoster.get(rosterId)?.length, 9);
    }
  });
});
