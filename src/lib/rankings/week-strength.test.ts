import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  SleeperPlayer,
  SleeperRoster,
  SleeperRosterPosition,
} from "@/lib/sleeper";

import { buildTeamStrengths } from "./team-strength";
import { buildWeekStrengthSources } from "./week-strength";

const ROSTER_POSITIONS: SleeperRosterPosition[] = [
  "QB",
  "RB",
  "RB",
  "WR",
  "WR",
  "TE",
  "FLEX",
  "FLEX",
  "K",
  "DEF",
  "BN",
  "BN",
];

function player(id: string, position: string, team = "NYJ"): SleeperPlayer {
  return {
    player_id: id,
    full_name: id === "PIT" ? null : `Player ${id}`,
    first_name: id === "PIT" ? "Pittsburgh" : "Player",
    last_name: id === "PIT" ? "Steelers" : id,
    position,
    fantasy_positions: [position],
    team,
    age: null,
    years_exp: null,
    status: null,
    injury_status: null,
    birth_date: null,
    height: null,
    weight: null,
  } as SleeperPlayer;
}

const PLAYERS: Record<string, SleeperPlayer> = Object.fromEntries(
  [
    player("qb1", "QB"),
    player("qb2", "QB"),
    player("rb1", "RB"),
    player("rb2", "RB"),
    player("rb3", "RB"),
    player("rb4", "RB"),
    player("rb5", "RB"),
    player("rb6", "RB"),
    player("wr1", "WR"),
    player("wr2", "WR"),
    player("wr3", "WR"),
    player("wr4", "WR"),
    player("wr5", "WR"),
    player("wr6", "WR"),
    player("te1", "TE"),
    player("te2", "TE"),
    player("k1", "K"),
    player("k2", "K"),
    player("PIT", "DEF", "PIT"),
    player("DAL", "DEF", "DAL"),
    player("ir1", "WR"),
    player("tx1", "RB"),
  ].map((p) => [p.player_id, p]),
);

const PROJECTIONS: Record<string, number> = {
  qb1: 20,
  qb2: 18,
  rb1: 15,
  rb2: 12,
  rb3: 18, // benched stud
  rb4: 12, // ties rb2
  rb5: 9,
  rb6: 11,
  wr1: 14,
  wr2: 10,
  wr3: 13,
  wr4: 16,
  wr5: 8,
  wr6: 7,
  te1: 8,
  te2: 6,
  k1: 7,
  k2: 9,
  PIT: 6,
  DAL: 5,
  ir1: 4,
  tx1: 3,
};

function roster(
  rosterId: number,
  starters: string[],
  extra: { bench?: string[]; reserve?: string[]; taxi?: string[] } = {},
): SleeperRoster {
  const reserve = extra.reserve ?? [];
  const taxi = extra.taxi ?? [];
  const bench = extra.bench ?? [];
  return {
    league_id: "L",
    roster_id: rosterId,
    owner_id: `owner-${rosterId}`,
    co_owners: null,
    players: [...starters.filter((id) => id !== "0"), ...bench, ...reserve, ...taxi],
    starters,
    reserve,
    taxi,
    keepers: null,
    player_map: null,
    metadata: null,
    settings: {} as SleeperRoster["settings"],
  } as SleeperRoster;
}

// Roster 1 left its second flex empty and its best back on the bench.
const ROSTERS: SleeperRoster[] = [
  roster(1, ["qb1", "rb1", "rb2", "wr1", "wr2", "te1", "wr3", "0", "k1", "PIT"], {
    bench: ["rb3"],
    reserve: ["ir1"],
    taxi: ["tx1"],
  }),
  roster(2, ["qb2", "rb4", "rb5", "wr4", "wr5", "te2", "rb6", "wr6", "k2", "DAL"]),
];

function build() {
  return buildWeekStrengthSources({
    rosters: ROSTERS,
    rosterPositions: ROSTER_POSITIONS,
    projections: PROJECTIONS,
    players: PLAYERS,
  });
}

describe("buildWeekStrengthSources", () => {
  it("reads the set lineup positionally and skips Sleeper's '0' empty slot", () => {
    const [one] = build();
    assert.ok(one);
    assert.equal(one.starters.length, 9);
    assert.deepEqual(
      one.starters.map((s) => s.slot),
      ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K", "DEF"],
    );
    // Total is the set lineup's projected points, kicker and defense included.
    assert.equal(one.total, 20 + 15 + 12 + 14 + 10 + 8 + 13 + 7 + 6);
  });

  it("puts everyone off the field into depth: bench, IR, taxi", () => {
    const [one, two] = build();
    assert.ok(one && two);
    assert.deepEqual(one.bench, [{ value: 18 }]);
    assert.deepEqual(one.reserve, [{ value: 4 }]);
    assert.deepEqual(one.taxi, [{ value: 3 }]);
    assert.deepEqual(two.bench, []);
    assert.deepEqual(one.picks, []);
  });

  it("ranks each starter within its position by projection, ties sharing the better rank", () => {
    const [one, two] = build();
    assert.ok(one && two);
    const rank = (src: typeof one, id: string) =>
      src.starters.find((s) => s.asset.assetId === id)?.asset.positionRank;
    // rb3 (18) is benched but still RB1 league-wide; rb1 (15) is RB2.
    assert.equal(rank(one, "rb1"), 2);
    // rb2 and rb4 both project 12: shared 3rd, then rb6 (11) is 5th.
    assert.equal(rank(one, "rb2"), 3);
    assert.equal(rank(two, "rb4"), 3);
    assert.equal(rank(two, "rb6"), 5);
    assert.equal(rank(one, "PIT"), 1);
  });

  it("names defenses from first and last name when Sleeper leaves full_name null", () => {
    const [one] = build();
    assert.ok(one);
    const pit = one.starters.find((s) => s.asset.assetId === "PIT");
    assert.equal(pit?.asset.name, "Pittsburgh Steelers");
    assert.equal(pit?.asset.position, "DEF");
    assert.equal(pit?.asset.team, "PIT");
  });

  it("falls back to the id and the slot for a player missing from players.json", () => {
    const [one] = buildWeekStrengthSources({
      rosters: [roster(9, ["ghost", "0", "0", "0", "0", "0", "0", "0", "0", "0"])],
      rosterPositions: ROSTER_POSITIONS,
      projections: { ghost: 5 },
      players: {},
    });
    assert.ok(one);
    assert.equal(one.starters.length, 1);
    assert.equal(one.starters[0]?.asset.name, "ghost");
    assert.equal(one.starters[0]?.asset.position, "QB");
    assert.equal(one.starters[0]?.asset.positionRank, 1);
    assert.equal(one.total, 5);
  });

  it("feeds buildTeamStrengths: PICKS drops out, FLEX folds both flex slots, depth counts the benched stud", () => {
    const sources = build();
    const strengths = buildTeamStrengths(sources);
    const one = strengths.get(1);
    const two = strengths.get(2);
    assert.ok(one && two);
    assert.deepEqual(
      one.groups.map((g) => g.key),
      ["QB", "RB", "WR", "TE", "FLEX", "DEPTH"],
    );
    const group = (s: typeof one, key: string) => s.groups.find((g) => g.key === key);
    // Roster 2 started two flex players (11 + 7) vs roster 1's one (13).
    assert.equal(group(two, "FLEX")?.value, 18);
    assert.equal(group(two, "FLEX")?.rank, 1);
    assert.equal(group(one, "FLEX")?.rank, 2);
    // Roster 1's depth is rb3 + ir1 + tx1 = 25; roster 2 has none.
    assert.equal(group(one, "DEPTH")?.value, 25);
    assert.equal(group(one, "DEPTH")?.rank, 1);
    // Overall rank follows the set lineup's projected total (105 vs 101).
    assert.equal(two.overallRank, 2);
    assert.equal(one.overallRank, 1);
  });
});
