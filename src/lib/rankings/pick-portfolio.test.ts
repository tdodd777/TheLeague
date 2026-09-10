import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  SleeperDraft,
  SleeperLeague,
  SleeperRoster,
  SleeperTradedPick,
} from "@/lib/sleeper";

import { buildPickPortfolios } from "./pick-portfolio";

const LEAGUE = {
  season: "2026",
  settings: { draft_rounds: 3 },
} as unknown as SleeperLeague;

function roster(rosterId: number): SleeperRoster {
  return {
    roster_id: rosterId,
    owner_id: `user-${rosterId}`,
  } as unknown as SleeperRoster;
}

const ROSTERS = [roster(1), roster(2)];

function draft(season: string, status: SleeperDraft["status"]): SleeperDraft {
  return {
    draft_id: `d-${season}`,
    season,
    status,
    draft_order: { "user-1": 2, "user-2": 1 },
    slot_to_roster_id: undefined,
  } as unknown as SleeperDraft;
}

function tradedPick(
  season: string,
  round: number,
  from: number,
  to: number,
): SleeperTradedPick {
  return {
    season,
    round,
    roster_id: from,
    previous_owner_id: from,
    owner_id: to,
  } as unknown as SleeperTradedPick;
}

describe("buildPickPortfolios", () => {
  it("keeps the upcoming draft's picks, slotted from draft_order, plus three future years", () => {
    const portfolios = buildPickPortfolios(LEAGUE, ROSTERS, [], [
      draft("2026", "pre_draft"),
    ]);
    const one = portfolios.get(1) ?? [];
    assert.equal(one.length, 12); // 3 rounds x 2026..2029
    assert.deepEqual(
      one.filter((p) => p.season === 2026).map((p) => p.slot),
      [2, 2, 2],
    );
    assert.ok(one.filter((p) => p.season === 2027).every((p) => p.slot === null));
  });

  it("drops a season once its draft is complete: those picks are players on the roster now", () => {
    const portfolios = buildPickPortfolios(
      LEAGUE,
      ROSTERS,
      // Sleeper keeps the completed season's trades in the ledger.
      [tradedPick("2026", 3, 2, 1), tradedPick("2027", 1, 2, 1)],
      [draft("2026", "complete")],
    );
    const one = portfolios.get(1) ?? [];
    const two = portfolios.get(2) ?? [];
    assert.equal(one.some((p) => p.season === 2026), false);
    assert.equal(two.some((p) => p.season === 2026), false);
    // Future-year trade still applies: roster 1 holds both 2027 firsts.
    assert.equal(one.filter((p) => p.season === 2027 && p.round === 1).length, 2);
    assert.equal(two.filter((p) => p.season === 2027 && p.round === 1).length, 0);
    assert.equal(one.length, 10);
    assert.equal(two.length, 8);
  });
});
