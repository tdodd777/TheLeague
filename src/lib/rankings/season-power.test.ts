import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Manager } from "@/lib/types";

import { computeAllPlayRecord, computeSeasonPower } from "./season-power";
import type { SeasonInputs } from "./season-power";
import type { RosterValueBreakdown } from "./types";

/** Smallest Manager that satisfies the type. Nothing here is asserted on. */
function manager(rosterId: number): Manager {
  return {
    userId: `user-${rosterId}`,
    rosterId,
    username: `mgr${rosterId}`,
    displayName: `Manager ${rosterId}`,
    teamName: null,
    avatar: null,
    avatarUrl: "",
  };
}

/** Only `starterValue` feeds the composite, so the rest stays empty. */
function seasonValue(rosterId: number, starterValue: number): RosterValueBreakdown {
  return {
    rosterId,
    manager: manager(rosterId),
    mode: "season",
    starterValue,
    benchValue: 0,
    reserveValue: 0,
    taxiValue: 0,
    pickValue: 0,
    studBonus: 0,
    total: starterValue,
    byPosition: {},
    starters: [],
    bench: [],
    reserve: [],
    taxi: [],
    picks: [],
    starterAvgAge: null,
    rosterAvgAge: null,
    trend30Day: 0,
  };
}

interface RosterFixture {
  rosterId: number;
  weekly: number[];
  actualWins: number;
  actualLosses: number;
  actualTies?: number;
  starterValue?: number;
}

function buildInputs(rows: readonly RosterFixture[]): SeasonInputs[] {
  return rows.map((r) => ({
    rosterId: r.rosterId,
    manager: manager(r.rosterId),
    seasonValue: seasonValue(r.rosterId, r.starterValue ?? 10_000),
    weekly: r.weekly,
    pointsFor: r.weekly.reduce((sum, n) => sum + n, 0),
    actualWins: r.actualWins,
    actualLosses: r.actualLosses,
    actualTies: r.actualTies ?? 0,
    potentialPoints: 0,
  }));
}

function weeklyMap(rows: readonly RosterFixture[]): Map<number, number[]> {
  return new Map(rows.map((r) => [r.rosterId, r.weekly]));
}

/**
 * Four rosters, three weeks, a full round robin:
 *   week 1  1v2  3v4
 *   week 2  1v3  2v4
 *   week 3  1v4  2v3
 *
 * Week 1 has rosters 1 and 3 tied on 100.0 — they are NOT playing each other,
 * so it is an all-play tie without being a real tie in the standings. Every
 * head-to-head game has a winner, which is what makes the league-wide schedule
 * luck sum exactly zero.
 */
const ROUND_ROBIN: readonly RosterFixture[] = [
  { rosterId: 1, weekly: [100, 120, 80], actualWins: 2, actualLosses: 1 },
  { rosterId: 2, weekly: [90, 105, 88], actualWins: 1, actualLosses: 2 },
  { rosterId: 3, weekly: [100, 95, 99], actualWins: 2, actualLosses: 1 },
  { rosterId: 4, weekly: [80, 100, 115], actualWins: 1, actualLosses: 2 },
];

describe("computeAllPlayRecord", () => {
  it("counts a tie as a tie, not a loss", () => {
    const record = computeAllPlayRecord(
      new Map([
        [1, [111.5]],
        [2, [111.5]],
      ]),
    );
    assert.deepEqual(record.get(1), { wins: 0, losses: 0, ties: 1 });
    assert.deepEqual(record.get(2), { wins: 0, losses: 0, ties: 1 });
  });

  it("scores every roster against every other roster each week", () => {
    const record = computeAllPlayRecord(weeklyMap(ROUND_ROBIN));

    // Three weeks x three opponents = nine decisions for everyone.
    for (const rosterId of [1, 2, 3, 4]) {
      const cell = record.get(rosterId);
      assert.ok(cell, `missing all-play record for roster ${rosterId}`);
      assert.equal(cell.wins + cell.losses + cell.ties, 9);
    }

    assert.deepEqual(record.get(1), { wins: 5, losses: 3, ties: 1 });
    assert.deepEqual(record.get(2), { wins: 4, losses: 5, ties: 0 });
    assert.deepEqual(record.get(3), { wins: 4, losses: 4, ties: 1 });
    assert.deepEqual(record.get(4), { wins: 4, losses: 5, ties: 0 });
  });

  it("ignores a week where fewer than two rosters have a score", () => {
    const record = computeAllPlayRecord(
      new Map([
        [1, [100, 120]],
        [2, [90]],
      ]),
    );
    // Week 2 has one score in it, so it decides nothing.
    assert.deepEqual(record.get(1), { wins: 1, losses: 0, ties: 0 });
    assert.deepEqual(record.get(2), { wins: 0, losses: 1, ties: 0 });
  });
});

describe("computeSeasonPower", () => {
  it("sums schedule luck to zero across the league", () => {
    const rows = computeSeasonPower(buildInputs(ROUND_ROBIN), weeklyMap(ROUND_ROBIN));
    assert.equal(rows.length, 4);

    const totalLuck = rows.reduce((sum, r) => sum + r.scheduleLuck, 0);
    assert.ok(
      Math.abs(totalLuck) < 1e-9,
      `schedule luck must net out league-wide, got ${totalLuck}`,
    );

    // Same statement from the other side: expected wins across the league has
    // to equal the wins the schedule actually handed out.
    const actual = rows.reduce((sum, r) => sum + r.actualWins, 0);
    const expected = rows.reduce((sum, r) => sum + r.expectedWins, 0);
    assert.equal(actual, 6);
    assert.ok(Math.abs(actual - expected) < 1e-9);
  });

  it("prices a tie as half a win when converting all-play to expected wins", () => {
    const rows = computeSeasonPower(
      buildInputs([
        { rosterId: 1, weekly: [111.5], actualWins: 0, actualLosses: 0, actualTies: 1 },
        { rosterId: 2, weekly: [111.5], actualWins: 0, actualLosses: 0, actualTies: 1 },
      ]),
      new Map([
        [1, [111.5]],
        [2, [111.5]],
      ]),
    );

    for (const row of rows) {
      // A tie is 0.5, not 0. Treating it as a loss would give 0 here.
      assert.equal(row.allPlayPct, 0.5);
      assert.equal(row.allPlayIndex, 1);
      assert.equal(row.expectedWins, 0.5);
      assert.equal(row.scheduleLuck, -0.5);
    }
  });

  it("scores an all-identical league at 100 on every component", () => {
    const rows = computeSeasonPower(
      buildInputs([
        { rosterId: 1, weekly: [100, 100, 100], actualWins: 2, actualLosses: 1 },
        { rosterId: 2, weekly: [100, 100, 100], actualWins: 1, actualLosses: 2 },
      ]),
      new Map([
        [1, [100, 100, 100]],
        [2, [100, 100, 100]],
      ]),
    );

    for (const row of rows) {
      assert.equal(row.valueIndex, 1);
      assert.equal(row.ppgIndex, 1);
      assert.equal(row.last3Index, 1);
      assert.equal(row.allPlayIndex, 1);
      assert.equal(row.total, 100);
      assert.equal(row.rankingUnavailable, false);
    }
  });

  it("sorts by composite score, best first", () => {
    const rows = computeSeasonPower(buildInputs(ROUND_ROBIN), weeklyMap(ROUND_ROBIN));
    for (let i = 1; i < rows.length; i += 1) {
      const prev = rows[i - 1];
      const cur = rows[i];
      assert.ok(prev && cur);
      assert.ok(prev.total >= cur.total);
    }
  });

  it("flags the ranking unavailable when no roster has a starter value", () => {
    const rows = computeSeasonPower(
      buildInputs([
        { rosterId: 1, weekly: [100], actualWins: 1, actualLosses: 0, starterValue: 0 },
        { rosterId: 2, weekly: [90], actualWins: 0, actualLosses: 1, starterValue: 0 },
      ]),
      new Map([
        [1, [100]],
        [2, [90]],
      ]),
    );
    for (const row of rows) {
      assert.equal(row.rankingUnavailable, true);
      assert.equal(row.valueIndex, 0);
      // The remaining components still carry the score, so it is not zeroed.
      assert.ok(row.total > 0);
    }
  });

  it("keeps pre-season rows on the ~100 scale with only the value component", () => {
    const rows = computeSeasonPower(
      buildInputs([
        { rosterId: 1, weekly: [], actualWins: 0, actualLosses: 0, starterValue: 12_000 },
        { rosterId: 2, weekly: [], actualWins: 0, actualLosses: 0, starterValue: 8_000 },
      ]),
      new Map([
        [1, []],
        [2, []],
      ]),
    );
    const top = rows[0];
    const bottom = rows[1];
    assert.ok(top && bottom);
    assert.equal(top.total, 120);
    assert.equal(bottom.total, 80);
    assert.equal(top.gamesPlayed, 0);
    assert.equal(top.scheduleLuck, 0);
  });
});
