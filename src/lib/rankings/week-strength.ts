/**
 * Week view of the team overview card: the same per-position read as the
 * dynasty and season views, but valued in Sleeper's projected points for the
 * lineup each manager has actually set this week, not in FantasyCalc dollars.
 *
 * The starters array Sleeper stores on a roster is positional: index i holds
 * the player in `league.roster_positions[i]` (bench slots excluded), with "0"
 * marking an empty slot. That is the lineup the manager set, so the week view
 * grades decisions, not just talent: leaving a stud on the bench shows up here
 * and nowhere else.
 */

import {
  getCurrentLeague,
  readPlayers,
  readProjections,
  readRosters,
  readSeasonManifest,
} from "@/lib/data";
import type {
  SleeperPlayer,
  SleeperRoster,
  SleeperRosterPosition,
} from "@/lib/sleeper";

import type { StrengthSource } from "./team-strength";
import type { StarterSlot } from "./types";

/** Sleeper roster_position codes that are not starting slots. */
const NON_STARTING: ReadonlySet<SleeperRosterPosition> = new Set([
  "BN",
  "IR",
  "TAXI",
]);

/** Sleeper's regular + playoff calendar; projections exist for weeks 1..18. */
const MAX_WEEK = 18;

export interface WeekStarter {
  slot: StarterSlot;
  asset: {
    /** Sleeper player_id. */
    assetId: string;
    name: string;
    position: string;
    team: string | null;
    /** Projected points this week. */
    value: number;
    /** Rank among every projected player at this position, or null if unprojected. */
    positionRank: number | null;
  };
}

export interface WeekStrengthSource extends StrengthSource {
  rosterId: number;
  /** Projected points of the set lineup, kicker and defense included. */
  total: number;
  starters: WeekStarter[];
  bench: Array<{ value: number }>;
  reserve: Array<{ value: number }>;
  taxi: Array<{ value: number }>;
  /** Picks carry no weekly value. Always empty, so the PICKS row drops out. */
  picks: never[];
}

export interface WeekStrength {
  season: string;
  week: number;
  sources: WeekStrengthSource[];
}

interface BuildInput {
  rosters: readonly SleeperRoster[];
  rosterPositions: readonly SleeperRosterPosition[];
  /** player_id → projected points for the week. */
  projections: Readonly<Record<string, number>>;
  players: Readonly<Record<string, SleeperPlayer>>;
}

function playerName(id: string, player: SleeperPlayer | undefined): string {
  if (!player) return id;
  if (player.full_name) return player.full_name;
  const joined = [player.first_name, player.last_name]
    .filter((s): s is string => Boolean(s))
    .join(" ");
  return joined || id;
}

function projected(projections: Readonly<Record<string, number>>, id: string): number {
  const value = projections[id];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Rank every projected player within its position, ties sharing the better
 * rank. Players absent from `players` are grouped under "UNK" so they still
 * get a rank rather than crashing the strip.
 */
function rankProjectionsByPosition(
  projections: Readonly<Record<string, number>>,
  players: Readonly<Record<string, SleeperPlayer>>,
): Map<string, number> {
  const byPosition = new Map<string, Array<{ id: string; value: number }>>();
  for (const [id, value] of Object.entries(projections)) {
    if (!Number.isFinite(value)) continue;
    const position = players[id]?.position ?? "UNK";
    const list = byPosition.get(position) ?? [];
    list.push({ id, value });
    byPosition.set(position, list);
  }
  const ranks = new Map<string, number>();
  for (const list of byPosition.values()) {
    list.sort((a, b) => b.value - a.value);
    let previousValue: number | null = null;
    let previousRank = 0;
    list.forEach((entry, index) => {
      const rank =
        previousValue !== null && entry.value === previousValue
          ? previousRank
          : index + 1;
      ranks.set(entry.id, rank);
      previousValue = entry.value;
      previousRank = rank;
    });
  }
  return ranks;
}

/**
 * One strength source per roster, valued in this week's projected points.
 * Pure: hand it the league, and every rank in `buildTeamStrengths` is relative
 * to the rosters passed in.
 */
export function buildWeekStrengthSources(input: BuildInput): WeekStrengthSource[] {
  const { rosters, rosterPositions, projections, players } = input;
  const slots = rosterPositions.filter(
    (p): p is StarterSlot => !NON_STARTING.has(p),
  );
  const positionRanks = rankProjectionsByPosition(projections, players);

  return rosters.map((roster) => {
    const setStarters = roster.starters ?? [];
    const reserveIds = new Set(roster.reserve ?? []);
    const taxiIds = new Set(roster.taxi ?? []);

    const starters: WeekStarter[] = [];
    const starterIds = new Set<string>();
    slots.forEach((slot, index) => {
      const id = setStarters[index];
      // "0" is Sleeper's empty slot; it contributes nothing and has no face.
      if (!id || id === "0") return;
      starterIds.add(id);
      const player = players[id];
      starters.push({
        slot,
        asset: {
          assetId: id,
          name: playerName(id, player),
          position: player?.position ?? slot,
          team: player?.team ?? null,
          value: projected(projections, id),
          positionRank: positionRanks.get(id) ?? null,
        },
      });
    });

    const depth = (roster.players ?? []).filter(
      (id) =>
        id !== "0" &&
        !starterIds.has(id) &&
        !reserveIds.has(id) &&
        !taxiIds.has(id),
    );
    const toValue = (id: string) => ({ value: projected(projections, id) });

    return {
      rosterId: roster.roster_id,
      total: starters.reduce((sum, s) => sum + s.asset.value, 0),
      starters,
      bench: depth.map(toValue),
      reserve: [...reserveIds].map(toValue),
      taxi: [...taxiIds].map(toValue),
      picks: [],
    };
  });
}

/**
 * The current season's week view, or null when there is nothing to grade:
 * off-season, or no projections cached for the NFL week the last ingest saw.
 */
export async function loadWeekStrength(): Promise<WeekStrength | null> {
  const { season, league } = await getCurrentLeague();
  if (league.status !== "in_season") return null;
  const manifest = await readSeasonManifest(season);
  const week = manifest?.nflState?.week;
  if (typeof week !== "number" || week < 1 || week > MAX_WEEK) return null;
  const projections = await readProjections(season, week);
  if (!projections) return null;
  const [rosters, players] = await Promise.all([
    readRosters(season),
    readPlayers(),
  ]);
  return {
    season,
    week,
    sources: buildWeekStrengthSources({
      rosters,
      rosterPositions: league.roster_positions,
      projections,
      players,
    }),
  };
}
