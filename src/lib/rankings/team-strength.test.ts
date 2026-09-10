import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Manager } from "@/lib/types";

import { buildTeamStrengths, ordinal, ordinalSuffix } from "./team-strength";
import type {
  RosterValueBreakdown,
  StarterAssignment,
  StarterSlot,
  ValuedAsset,
} from "./types";

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

function asset(id: string, position: string, value: number): ValuedAsset {
  return {
    assetId: id,
    name: id,
    position,
    team: null,
    age: null,
    value,
    trend30Day: 0,
    overallRank: null,
    positionRank: null,
    missing: false,
  };
}

function starter(slot: StarterSlot, value: number): StarterAssignment {
  return {
    asset: asset(`${slot}-${value}`, slot === "FLEX" ? "RB" : slot, value),
    slot,
    slotIndex: 0,
  };
}

interface Fixture {
  rosterId: number;
  starters?: StarterAssignment[];
  bench?: ValuedAsset[];
  taxi?: ValuedAsset[];
  picks?: ValuedAsset[];
}

function breakdown(f: Fixture): RosterValueBreakdown {
  const starters = f.starters ?? [];
  const bench = f.bench ?? [];
  const taxi = f.taxi ?? [];
  const picks = f.picks ?? [];
  const total =
    starters.reduce((s, x) => s + x.asset.value, 0) +
    bench.reduce((s, x) => s + x.value, 0) +
    taxi.reduce((s, x) => s + x.value, 0) +
    picks.reduce((s, x) => s + x.value, 0);
  return {
    rosterId: f.rosterId,
    manager: manager(f.rosterId),
    mode: "dynasty",
    starterValue: starters.reduce((s, x) => s + x.asset.value, 0),
    benchValue: 0,
    reserveValue: 0,
    taxiValue: 0,
    pickValue: picks.reduce((s, x) => s + x.value, 0),
    studBonus: 0,
    total,
    byPosition: {},
    starters,
    bench,
    reserve: [],
    taxi,
    picks,
    starterAvgAge: null,
    rosterAvgAge: null,
    trend30Day: 0,
  };
}

describe("buildTeamStrengths", () => {
  it("ranks each group independently of the overall rank", () => {
    // Roster 1 wins overall on receivers; roster 2 owns the best QB.
    const rosters = [
      breakdown({
        rosterId: 1,
        starters: [starter("QB", 1000), starter("WR", 9000)],
      }),
      breakdown({
        rosterId: 2,
        starters: [starter("QB", 8000), starter("WR", 500)],
      }),
    ];

    const strengths = buildTeamStrengths(rosters);
    const one = strengths.get(1);
    const two = strengths.get(2);
    assert.ok(one && two);

    assert.equal(one.overallRank, 1);
    assert.equal(two.overallRank, 2);

    const oneQb = one.groups.find((g) => g.key === "QB");
    const twoQb = two.groups.find((g) => g.key === "QB");
    assert.equal(oneQb?.rank, 2);
    assert.equal(twoQb?.rank, 1);
    // Bars are min-max across the league, so the best group fills and the
    // thinnest empties.
    assert.equal(twoQb?.share, 1);
    assert.equal(oneQb?.share, 0);
  });

  it("spreads bar length across the league range", () => {
    const rosters = [
      breakdown({ rosterId: 1, starters: [starter("TE", 1000)] }),
      breakdown({ rosterId: 2, starters: [starter("TE", 600)] }),
      breakdown({ rosterId: 3, starters: [starter("TE", 200)] }),
    ];
    const strengths = buildTeamStrengths(rosters);
    const shareAt = (rosterId: number) =>
      strengths.get(rosterId)?.groups.find((g) => g.key === "TE")?.share;
    assert.equal(shareAt(1), 1);
    assert.equal(shareAt(2), 0.5);
    assert.equal(shareAt(3), 0);
  });

  it("fills every bar when the league is dead even at a group", () => {
    const rosters = [
      breakdown({ rosterId: 1, starters: [starter("QB", 700)] }),
      breakdown({ rosterId: 2, starters: [starter("QB", 700)] }),
    ];
    const strengths = buildTeamStrengths(rosters);
    assert.equal(
      strengths.get(2)?.groups.find((g) => g.key === "QB")?.share,
      1,
    );
  });

  it("scores the top roster at 100 and the rest relative to it", () => {
    const rosters = [
      breakdown({ rosterId: 1, starters: [starter("QB", 1000)] }),
      breakdown({ rosterId: 2, starters: [starter("QB", 500)] }),
    ];
    const strengths = buildTeamStrengths(rosters);
    assert.equal(strengths.get(1)?.score, 100);
    assert.equal(strengths.get(2)?.score, 50);
  });

  it("gives tied groups the same rank", () => {
    const rosters = [
      breakdown({ rosterId: 1, starters: [starter("TE", 2000)] }),
      breakdown({ rosterId: 2, starters: [starter("TE", 2000)] }),
      breakdown({ rosterId: 3, starters: [starter("TE", 100)] }),
    ];
    const strengths = buildTeamStrengths(rosters);
    const rankAt = (rosterId: number) =>
      strengths.get(rosterId)?.groups.find((g) => g.key === "TE")?.rank;
    assert.equal(rankAt(1), 1);
    assert.equal(rankAt(2), 1);
    assert.equal(rankAt(3), 3);
  });

  it("folds every flex slot into one group and sums multi-slot positions", () => {
    const rosters = [
      breakdown({
        rosterId: 1,
        starters: [
          starter("RB", 1000),
          starter("RB", 400),
          starter("FLEX", 700),
          starter("SUPER_FLEX", 300),
        ],
      }),
    ];
    const groups = buildTeamStrengths(rosters).get(1)?.groups ?? [];
    assert.equal(groups.find((g) => g.key === "RB")?.value, 1400);
    assert.equal(groups.find((g) => g.key === "FLEX")?.value, 1000);
  });

  it("drops groups the league prices at zero, and keeps K/DEF out entirely", () => {
    const rosters = [
      breakdown({
        rosterId: 1,
        // No picks and no depth: both groups should disappear rather than
        // render twelve identical zeroes.
        starters: [starter("QB", 1000), starter("K", 0), starter("DEF", 0)],
      }),
      breakdown({ rosterId: 2, starters: [starter("QB", 900)] }),
    ];
    const keys = (buildTeamStrengths(rosters).get(1)?.groups ?? []).map(
      (g) => g.key,
    );
    assert.deepEqual(keys, ["QB"]);
  });

  it("counts bench and taxi together as depth", () => {
    const rosters = [
      breakdown({
        rosterId: 1,
        bench: [asset("b1", "WR", 600)],
        taxi: [asset("t1", "RB", 400)],
      }),
      breakdown({ rosterId: 2, bench: [asset("b2", "WR", 100)] }),
    ];
    const depth = buildTeamStrengths(rosters)
      .get(1)
      ?.groups.find((g) => g.key === "DEPTH");
    assert.equal(depth?.value, 1000);
    assert.equal(depth?.rank, 1);
  });

  it("returns an empty map for an empty league", () => {
    assert.equal(buildTeamStrengths([]).size, 0);
  });
});

describe("ordinal", () => {
  it("handles the teen exceptions", () => {
    assert.equal(ordinal(11), "11th");
    assert.equal(ordinal(12), "12th");
    assert.equal(ordinal(13), "13th");
  });

  it("handles the common suffixes", () => {
    assert.deepEqual(
      [1, 2, 3, 4, 21, 22, 23].map(ordinal),
      ["1st", "2nd", "3rd", "4th", "21st", "22nd", "23rd"],
    );
    assert.equal(ordinalSuffix(3), "rd");
  });
});
