import assert from "node:assert/strict";
import { test } from "node:test";

import {
  aggregateFranchiseHistory,
  buildMoveNotes,
  formatSeasonRanges,
  type FranchiseGameInput,
  type FranchiseSeasonInput,
  type FranchiseTransactionInput,
} from "./franchise-history";

function game(
  week: number,
  starters: string[],
  startersPoints: number[],
  playersPoints: Record<string, number> = {},
  phase: FranchiseGameInput["phase"] = "regular",
): FranchiseGameInput {
  return { week, phase, matchup: { starters, starters_points: startersPoints, players_points: playersPoints } };
}

function season(id: string, games: FranchiseGameInput[], rostered: string[]): FranchiseSeasonInput {
  return { season: id, games, rostered: new Set(rostered) };
}

test("counts starter points only, never bench points", () => {
  const history = aggregateFranchiseHistory(
    [season("2024", [game(1, ["a", "b"], [20, 10], { a: 20, b: 10, bench: 50 })], ["a", "b", "bench"])],
    new Set(),
  );
  assert.deepEqual(history.scorers.map((r) => [r.playerId, r.points, r.starts]), [["a", 20, 1], ["b", 10, 1]]);
  assert.equal(history.scorers.some((r) => r.playerId === "bench"), false);
});

test("sums across seasons and skips empty lineup slots", () => {
  const history = aggregateFranchiseHistory(
    [
      season("2023", [game(1, ["a", "0"], [12.1, 0]), game(2, ["a", ""], [7.2, 0])], ["a"]),
      season("2024", [game(1, ["a"], [30.05])], ["a"]),
    ],
    new Set(["a"]),
  );
  assert.equal(history.scorers.length, 1);
  const [row] = history.scorers;
  assert.equal(row?.points, 49.35);
  assert.equal(row?.starts, 3);
  assert.deepEqual(row?.seasons, ["2023", "2024"]);
});

test("uses the slot score and falls back to the player map when it is missing", () => {
  const history = aggregateFranchiseHistory(
    [season("2024", [game(1, ["a", "b"], [5], { a: 99, b: 8 })], ["a", "b"])],
    new Set(),
  );
  const byId = new Map(history.scorers.map((r) => [r.playerId, r.points]));
  assert.equal(byId.get("a"), 5);
  assert.equal(byId.get("b"), 8);
});

test("tenure counts distinct seasons, flags current players and orders ties", () => {
  const history = aggregateFranchiseHistory(
    [
      season("2021", [game(1, ["vet"], [10])], ["vet", "gone"]),
      season("2022", [], ["vet", "gone"]),
      season("2023", [game(1, ["vet", "newer"], [10, 40])], ["vet", "newer"]),
      season("2024", [], ["vet", "newer"]),
    ],
    new Set(["vet", "newer"]),
  );
  assert.deepEqual(
    history.tenure.map((r) => [r.playerId, r.seasons.length, r.current]),
    [["vet", 4, true], ["newer", 2, true], ["gone", 2, false]],
  );
  assert.equal(history.seasonsByPlayer.get("vet"), 4);
  assert.equal(history.seasonsByPlayer.get("gone"), 2);
});

test("a starter missing from the roster snapshot still counts toward tenure", () => {
  const history = aggregateFranchiseHistory([season("2022", [game(3, ["rental"], [11])], [])], new Set());
  assert.equal(history.seasonsByPlayer.get("rental"), 1);
});

test("best games keep season, week and phase, highest first", () => {
  const history = aggregateFranchiseHistory(
    [
      season("2023", [game(4, ["a", "b"], [21, 44])], ["a", "b"]),
      season("2024", [game(16, ["a"], [52.5], {}, "playoff")], ["a"]),
    ],
    new Set(),
    { scorers: 10, tenure: 10, bestGames: 2 },
  );
  assert.deepEqual(history.bestGames, [
    { playerId: "a", points: 52.5, season: "2024", week: 16, phase: "playoff" },
    { playerId: "b", points: 44, season: "2023", week: 4, phase: "regular" },
  ]);
  assert.deepEqual(history.lastGame, { season: "2024", week: 16 });
  assert.deepEqual(history.seasonsCounted, ["2023", "2024"]);
});

test("a team with no games returns empty boards", () => {
  const history = aggregateFranchiseHistory([season("2026", [], ["a"])], new Set(["a"]));
  assert.deepEqual(history.scorers, []);
  assert.deepEqual(history.bestGames, []);
  assert.equal(history.lastGame, null);
  assert.equal(history.tenure[0]?.playerId, "a");
});

test("season ranges compress runs and show gaps", () => {
  assert.equal(formatSeasonRanges(["2020", "2021", "2022", "2025"]), "2020–2022, 2025");
  assert.equal(formatSeasonRanges(["2024"]), "2024");
  assert.equal(formatSeasonRanges(["2026", "2024", "2025"]), "2024–2026");
  assert.equal(formatSeasonRanges([]), "");
});

function tx(
  season: string,
  type: FranchiseTransactionInput["tx"]["type"],
  adds: Record<string, number> | null,
  drops: Record<string, number> | null,
  at: number,
  status: FranchiseTransactionInput["tx"]["status"] = "complete",
): FranchiseTransactionInput {
  return { season, tx: { type, status, adds, drops, status_updated: at, created: at } };
}

const teamOf = (season: string, rosterId: number) => ({ username: `manager-${rosterId}`, name: `${season} team ${rosterId}` });

test("a player traded away is labelled with the receiving team at the time", () => {
  const notes = buildMoveNotes(
    ["moore"],
    [tx("2026", "trade", { moore: 3 }, { moore: 11 }, 200)],
    new Map([["2026", 11]]),
    new Set(),
    teamOf,
  );
  assert.deepEqual(notes.get("moore"), {
    kind: "traded-away",
    team: { username: "manager-3", name: "2026 team 3" },
    season: "2026",
    at: 200,
  });
});

test("a current player who came in by trade names the team they came from", () => {
  const notes = buildMoveNotes(
    ["p"],
    [tx("2023", "trade", { p: 11 }, { p: 7 }, 100)],
    new Map([["2023", 11], ["2024", 11]]),
    new Set(["p"]),
    teamOf,
  );
  assert.equal(notes.get("p")?.kind, "acquired");
  assert.equal(notes.get("p")?.team?.name, "2023 team 7");
});

test("a waiver pickup still on the roster gets no note, a dropped former player does", () => {
  const notes = buildMoveNotes(
    ["kept", "cut"],
    [
      tx("2025", "waiver", { kept: 11 }, null, 100),
      tx("2025", "waiver", { cut: 11 }, null, 100),
      tx("2025", "free_agent", null, { cut: 11 }, 300),
    ],
    new Map([["2025", 11]]),
    new Set(["kept"]),
    teamOf,
  );
  assert.equal(notes.has("kept"), false);
  assert.deepEqual(notes.get("cut"), { kind: "dropped", team: null, season: "2025", at: 300 });
});

test("the latest move wins and roster slots are matched per season", () => {
  // The manager is slot 4 in 2024 and slot 9 in 2025. Slot 9 in 2024 is a
  // different manager, so its trade must not count.
  const notes = buildMoveNotes(
    ["p"],
    [
      tx("2024", "trade", { p: 4 }, { p: 2 }, 100),
      tx("2024", "trade", { p: 5 }, { p: 9 }, 150),
      tx("2025", "trade", { p: 6 }, { p: 9 }, 400),
    ],
    new Map([["2024", 4], ["2025", 9]]),
    new Set(),
    teamOf,
  );
  assert.equal(notes.get("p")?.kind, "traded-away");
  assert.equal(notes.get("p")?.team?.name, "2025 team 6");
});

test("failed transactions and players not on the boards are ignored", () => {
  const notes = buildMoveNotes(
    ["p"],
    [
      tx("2026", "trade", { p: 3 }, { p: 11 }, 100, "failed"),
      tx("2026", "trade", { other: 3 }, { other: 11 }, 100),
    ],
    new Map([["2026", 11]]),
    new Set(),
    teamOf,
  );
  assert.equal(notes.size, 0);
});

test("a new manager does not inherit moves made before they took over the slot", () => {
  // Slot 2 changed hands for 2026. The 2025 trade belongs to the old manager.
  const notes = buildMoveNotes(
    ["p", "q"],
    [
      tx("2025", "trade", { p: 5 }, { p: 2 }, 100),
      tx("2026", "trade", { q: 5 }, { q: 2 }, 300),
    ],
    new Map([["2026", 2]]),
    new Set(),
    teamOf,
  );
  assert.equal(notes.has("p"), false);
  assert.equal(notes.get("q")?.kind, "traded-away");
});
