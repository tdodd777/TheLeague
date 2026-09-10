import type {
  SleeperLeague,
  SleeperMatchup,
  SleeperPlayer,
  SleeperRosterPosition,
} from "@/lib/sleeper";

import {
  readLeague,
  readMatchups,
  readPlayers,
  readProjections,
} from "./cache";

const NON_STARTING: ReadonlySet<SleeperRosterPosition> = new Set([
  "BN",
  "IR",
  "TAXI",
]);

export interface LineupSpot {
  /** Starter slot label, e.g. "QB", "RB", "FLEX". */
  slot: string;
  playerId: string;
  /** Resolved name; falls back to player_id when missing. */
  name: string;
  /** Player position from the player metadata, for color dots. */
  position: string;
  team: string | null;
  points: number;
  /** Pre-game projected fantasy points, if cached for this week. */
  projection: number | null;
}

export interface BenchSpot {
  playerId: string;
  name: string;
  position: string;
  team: string | null;
  points: number;
  projection: number | null;
}

export interface RosterLineup {
  rosterId: number;
  totalPoints: number;
  starters: LineupSpot[];
  bench: BenchSpot[];
  /** Sum of starter projections; null if no projections were available. */
  projectedTotal: number | null;
  /**
   * Optimal points the manager could have scored by setting the best lineup
   * available from their roster (starters + bench), respecting the slot
   * constraints. Used for the "left on the bench" callout.
   */
  optimalPoints: number;
  /** Difference between optimalPoints and totalPoints (≥ 0). */
  pointsLeftOnBench: number;
}

function playerName(p: SleeperPlayer | undefined, id: string): string {
  if (!p) return id;
  if (p.full_name) return p.full_name;
  if (p.first_name && p.last_name) return `${p.first_name} ${p.last_name}`;
  return id;
}

function playerPosition(
  p: SleeperPlayer | undefined,
  id: string,
): string {
  if (p?.position) return p.position;
  // DST: Sleeper stores team abbreviation as the player_id.
  if (id.length <= 3 && id === id.toUpperCase()) return "DEF";
  return "UNK";
}

/**
 * Pick the best lineup available from a pool of {position, points} candidates,
 * respecting the slot order. Used to compute "optimal points" — the most a
 * manager could have scored if they had set the right lineup that week.
 */
function optimalLineupPoints(
  starterSlots: SleeperRosterPosition[],
  candidates: ReadonlyArray<{ playerId: string; position: string; points: number }>,
): number {
  const FLEX_ELIGIBLE: Record<string, ReadonlySet<string>> = {
    FLEX: new Set(["RB", "WR", "TE"]),
    REC_FLEX: new Set(["WR", "TE"]),
    WRRB_FLEX: new Set(["RB", "WR"]),
    SUPER_FLEX: new Set(["QB", "RB", "WR", "TE"]),
  };
  const sorted = [...candidates].sort((a, b) => b.points - a.points);
  const used = new Set<string>();
  function take(eligible: (c: (typeof sorted)[number]) => boolean): number {
    for (const c of sorted) {
      if (used.has(c.playerId)) continue;
      if (!eligible(c)) continue;
      used.add(c.playerId);
      return c.points;
    }
    return 0;
  }

  let total = 0;
  // Fixed positions first.
  for (const slot of starterSlots) {
    if (slot === "FLEX" || slot === "REC_FLEX" || slot === "WRRB_FLEX" || slot === "SUPER_FLEX") {
      continue;
    }
    total += take((c) => c.position === slot);
  }
  // Then flex variants in order: most-restrictive first, SUPER_FLEX last.
  const FLEX_ORDER = ["REC_FLEX", "WRRB_FLEX", "FLEX", "SUPER_FLEX"] as const;
  for (const flexType of FLEX_ORDER) {
    for (const slot of starterSlots) {
      if (slot !== flexType) continue;
      const eligible = FLEX_ELIGIBLE[flexType]!;
      total += take((c) => eligible.has(c.position));
    }
  }
  return total;
}

function buildOne(
  matchup: SleeperMatchup,
  league: SleeperLeague,
  players: Record<string, SleeperPlayer>,
  projections: Record<string, number> | null,
): RosterLineup {
  const starterSlots = league.roster_positions.filter(
    (p) => !NON_STARTING.has(p),
  );
  const starterIds = matchup.starters ?? [];
  const starterPts = matchup.starters_points ?? [];
  const playersPts = matchup.players_points ?? {};
  const allPlayers = matchup.players ?? [];

  function projFor(playerId: string): number | null {
    if (!projections) return null;
    const v = projections[playerId];
    return typeof v === "number" ? v : null;
  }

  const starters: LineupSpot[] = starterIds.map((pid, i) => {
    const slot = starterSlots[i] ?? "?";
    const meta = players[pid];
    return {
      slot,
      playerId: pid,
      name: playerName(meta, pid),
      position: playerPosition(meta, pid),
      team: meta?.team ?? null,
      points: starterPts[i] ?? 0,
      projection: projFor(pid),
    };
  });

  const starterSet = new Set(starterIds);
  const bench: BenchSpot[] = allPlayers
    .filter((id) => id !== "0" && !starterSet.has(id))
    .map((id) => {
      const meta = players[id];
      return {
        playerId: id,
        name: playerName(meta, id),
        position: playerPosition(meta, id),
        team: meta?.team ?? null,
        points: playersPts[id] ?? 0,
        projection: projFor(id),
      };
    })
    .sort((a, b) => b.points - a.points);

  // Aggregate projection only if we have at least one projection for any starter.
  const projHits = starters.filter((s) => s.projection !== null);
  const projectedTotal =
    projHits.length === 0
      ? null
      : starters.reduce((s, x) => s + (x.projection ?? 0), 0);

  // Optimal lineup: include any rostered player who actually scored points
  // (some bench players have empty `players_points` entries; those default
  // to 0 already and are harmless).
  const optimalPoints = optimalLineupPoints(
    starterSlots,
    [...starters, ...bench].map((p) => ({
      playerId: p.playerId,
      position: p.position,
      points: p.points,
    })),
  );
  const pointsLeftOnBench = Math.max(0, optimalPoints - matchup.points);

  return {
    rosterId: matchup.roster_id,
    totalPoints: matchup.points,
    starters,
    bench,
    projectedTotal,
    optimalPoints,
    pointsLeftOnBench,
  };
}

/**
 * Pull both sides of a single weekly matchup, resolved with player names and
 * slot labels. Returns null if the week isn't cached or one of the rosters
 * isn't present in that week's matchups.
 */
export async function getMatchupLineups(
  season: string,
  week: number,
  rosterIdA: number,
  rosterIdB: number,
): Promise<{ a: RosterLineup; b: RosterLineup } | null> {
  const [matchups, league, players, projections] = await Promise.all([
    readMatchups(season, week),
    readLeague(season),
    readPlayers(),
    readProjections(season, week),
  ]);
  if (!matchups) return null;

  const ma = matchups.find((m) => m.roster_id === rosterIdA);
  const mb = matchups.find((m) => m.roster_id === rosterIdB);
  if (!ma || !mb) return null;
  if (ma.matchup_id !== mb.matchup_id) return null;

  return {
    a: buildOne(ma, league, players, projections),
    b: buildOne(mb, league, players, projections),
  };
}
