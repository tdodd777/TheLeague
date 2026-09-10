import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { before, describe, it } from "node:test";

/**
 * Same pattern as `weekly.test.ts`: `paths.ts` reads `process.cwd()` at import
 * time, so the fixture cache is built in a temp directory and the module is
 * imported from inside it. Nothing here touches the real `data/` directory.
 */
type BracketsModule = typeof import("./brackets");

let brackets: BracketsModule | null = null;

function mod(): BracketsModule {
  assert.ok(brackets, "brackets module was not loaded");
  return brackets;
}

/**
 * A 12-team league, six-team playoff. Roster 1 is the regular-season top seed
 * and roster 5 is the five seed. Roster 5 wins the title, so "champion" and
 * "best regular-season record" are deliberately different rosters — a bracket
 * reader that shortcuts to the top seed gets this wrong.
 *
 * Sleeper marks a placement game with `p` (the winner's final rank) and leaves
 * `p` null on the rounds that only advance teams.
 */
const WINNERS_BRACKET = [
  { r: 1, m: 1, t1: 3, t2: 6, w: 6, l: 3, p: null },
  { r: 1, m: 2, t1: 4, t2: 5, w: 5, l: 4, p: null },
  { r: 2, m: 3, t1: 1, t2: 6, w: 1, l: 6, p: null },
  { r: 2, m: 4, t1: 2, t2: 5, w: 5, l: 2, p: null },
  { r: 3, m: 5, t1: 1, t2: 5, w: 5, l: 1, p: 1 },
  { r: 3, m: 6, t1: 6, t2: 2, w: 2, l: 6, p: 3 },
  { r: 3, m: 7, t1: 3, t2: 4, w: 3, l: 4, p: 5 },
];

const LOSERS_BRACKET = [
  { r: 1, m: 1, t1: 7, t2: 12, w: 7, l: 12, p: null },
  { r: 2, m: 2, t1: 7, t2: 8, w: 8, l: 7, p: 1 },
  { r: 2, m: 3, t1: 9, t2: 10, w: 10, l: 9, p: 3 },
  { r: 2, m: 4, t1: 11, t2: 12, w: 11, l: 12, p: 5 },
];

async function buildFixtures(root: string): Promise<void> {
  const league = JSON.stringify({
    settings: { playoff_teams: 6, playoff_week_start: 15 },
  });

  const full = path.join(root, "data", "league-cache", "2024");
  await mkdir(full, { recursive: true });
  await writeFile(path.join(full, "league.json"), league);
  await writeFile(
    path.join(full, "winners_bracket.json"),
    JSON.stringify(WINNERS_BRACKET),
  );
  await writeFile(
    path.join(full, "losers_bracket.json"),
    JSON.stringify(LOSERS_BRACKET),
  );

  // A season that never had a losers bracket cached.
  const winnersOnly = path.join(root, "data", "league-cache", "2019");
  await mkdir(winnersOnly, { recursive: true });
  await writeFile(path.join(winnersOnly, "league.json"), league);
  await writeFile(
    path.join(winnersOnly, "winners_bracket.json"),
    JSON.stringify(WINNERS_BRACKET),
  );
}

before(async () => {
  const root = await mkdtemp(path.join(tmpdir(), "league-brackets-"));
  await buildFixtures(root);
  const previous = process.cwd();
  process.chdir(root);
  try {
    brackets = await import("./brackets");
  } finally {
    process.chdir(previous);
  }
});

describe("getSeasonPlacements", () => {
  it("returns the roster that won the championship game, not the top seed", async () => {
    const placements = await mod().getSeasonPlacements("2024");
    // Roster 1 entered as the top seed and lost the final.
    assert.equal(placements.champion, 5);
    assert.notEqual(placements.champion, 1);
    assert.equal(placements.runnerUp, 1);
    assert.equal(placements.byRosterId.get(5), 1);
    assert.equal(placements.byRosterId.get(1), 2);
  });

  it("places the loser of each placement game one rank below the winner", async () => {
    const placements = await mod().getSeasonPlacements("2024");
    assert.equal(placements.third, 2);
    assert.equal(placements.byRosterId.get(6), 4);
    assert.equal(placements.byRosterId.get(3), 5);
    assert.equal(placements.byRosterId.get(4), 6);
  });

  it("offsets the losers bracket by the playoff field size", async () => {
    const placements = await mod().getSeasonPlacements("2024");
    // Losers-bracket p=1 is 7th overall in a 12-team, 6-team-playoff league.
    assert.equal(placements.toiletBowlChamp, 8);
    assert.equal(placements.byRosterId.get(8), 7);
    assert.equal(placements.byRosterId.get(7), 8);
    assert.equal(placements.byRosterId.get(10), 9);
    assert.equal(placements.byRosterId.get(9), 10);
    assert.equal(placements.byRosterId.get(11), 11);
    assert.equal(placements.byRosterId.get(12), 12);
  });

  it("gives all twelve rosters exactly one distinct placement", async () => {
    const placements = await mod().getSeasonPlacements("2024");
    assert.equal(placements.byRosterId.size, 12);
    const places = [...placements.byRosterId.values()].sort((a, b) => a - b);
    assert.deepEqual(
      places,
      Array.from({ length: 12 }, (_, i) => i + 1),
    );
  });

  it("ignores advancement rounds that carry no placement", async () => {
    const placements = await mod().getSeasonPlacements("2024");
    // Roster 12 lost in losers round 1 (p null) and again in the p=5 game.
    // Only the placement game may set a rank.
    assert.equal(placements.byRosterId.get(12), 12);
  });

  it("works when the losers bracket was never cached", async () => {
    const placements = await mod().getSeasonPlacements("2019");
    assert.equal(placements.champion, 5);
    assert.equal(placements.toiletBowlChamp, null);
    assert.equal(placements.byRosterId.size, 6);
  });
});

describe("readWinnersBracket / readLosersBracket", () => {
  it("returns null rather than throwing when the file is absent", async () => {
    assert.equal(await mod().readLosersBracket("2019"), null);
    const winners = await mod().readWinnersBracket("2019");
    assert.equal(winners?.length, WINNERS_BRACKET.length);
  });
});
