import { listCachedSeasons, readMatchups, readRosters, readUsers } from "./cache";
import { buildManagerLookup } from "./managers";
import type { Manager } from "@/lib/types";

export interface H2HCell {
  /** Number of times manager A beat manager B. */
  wins: number;
  /** Number of times A lost to B. */
  losses: number;
  /** Ties between them. */
  ties: number;
  /** Sum of points scored by A in head-to-head games. */
  pf: number;
  /** Sum of points scored by B in head-to-head games. */
  pa: number;
  /** Number of regular-season head-to-head meetings. */
  games: number;
}

export interface H2HMeeting {
  season: string;
  week: number;
  /** Score of manager A. */
  myScore: number;
  /** Score of manager B. */
  oppScore: number;
  result: "W" | "L" | "T";
}

export interface H2HMatrix {
  managers: Manager[];
  /** managerA.userId -> managerB.userId -> cell. */
  cells: Map<string, Map<string, H2HCell>>;
  meetings: Map<string, Map<string, H2HMeeting[]>>;
}

const ZERO_CELL: H2HCell = { wins: 0, losses: 0, ties: 0, pf: 0, pa: 0, games: 0 };

function getCell(
  cells: Map<string, Map<string, H2HCell>>,
  a: string,
  b: string,
): H2HCell {
  let row = cells.get(a);
  if (!row) {
    row = new Map();
    cells.set(a, row);
  }
  let cell = row.get(b);
  if (!cell) {
    cell = { ...ZERO_CELL };
    row.set(b, cell);
  }
  return cell;
}

function getMeetings(
  meetings: Map<string, Map<string, H2HMeeting[]>>,
  a: string,
  b: string,
): H2HMeeting[] {
  let row = meetings.get(a);
  if (!row) {
    row = new Map();
    meetings.set(a, row);
  }
  let list = row.get(b);
  if (!list) {
    list = [];
    row.set(b, list);
  }
  return list;
}

/**
 * Build the all-time H2H matrix across every cached season. Aggregated by
 * Sleeper user_id (so a manager who switched teams stays consistent).
 */
export async function buildH2HMatrix(): Promise<H2HMatrix> {
  const seasons = await listCachedSeasons();

  // Union of all managers seen.
  const allManagers = new Map<string, Manager>();
  // For each season, build a roster_id -> Manager map.
  const rosterMaps: Array<{ season: string; map: Map<number, Manager> }> = [];
  for (const season of seasons) {
    const [users, rosters] = await Promise.all([
      readUsers(season),
      readRosters(season),
    ]);
    const lookup = buildManagerLookup(users, rosters);
    for (const m of lookup.list) {
      if (!allManagers.has(m.userId)) allManagers.set(m.userId, m);
    }
    rosterMaps.push({ season, map: lookup.byRosterId });
  }

  const cells = new Map<string, Map<string, H2HCell>>();
  const meetings = new Map<string, Map<string, H2HMeeting[]>>();

  for (const { season, map } of rosterMaps) {
    for (let week = 1; week <= 18; week += 1) {
      const matchups = await readMatchups(season, week);
      if (!matchups) continue;
      // Group by matchup_id.
      const byMatchup = new Map<number, typeof matchups>();
      for (const m of matchups) {
        const arr = byMatchup.get(m.matchup_id) ?? [];
        arr.push(m);
        byMatchup.set(m.matchup_id, arr);
      }
      for (const [, pair] of byMatchup) {
        if (pair.length !== 2) continue;
        const [a, b] = pair;
        if (!a || !b) continue;
        const ma = map.get(a.roster_id);
        const mb = map.get(b.roster_id);
        if (!ma || !mb) continue;
        // Skip games with both 0 points (unplayed weeks shouldn't pollute history).
        if (a.points === 0 && b.points === 0) continue;

        const aWon = a.points > b.points;
        const bWon = b.points > a.points;
        const tied = !aWon && !bWon;

        const aCell = getCell(cells, ma.userId, mb.userId);
        aCell.games += 1;
        aCell.pf += a.points;
        aCell.pa += b.points;
        if (aWon) aCell.wins += 1;
        else if (bWon) aCell.losses += 1;
        else aCell.ties += 1;

        const bCell = getCell(cells, mb.userId, ma.userId);
        bCell.games += 1;
        bCell.pf += b.points;
        bCell.pa += a.points;
        if (bWon) bCell.wins += 1;
        else if (aWon) bCell.losses += 1;
        else bCell.ties += 1;

        const aResult: H2HMeeting["result"] = aWon ? "W" : tied ? "T" : "L";
        const bResult: H2HMeeting["result"] = bWon ? "W" : tied ? "T" : "L";
        getMeetings(meetings, ma.userId, mb.userId).push({
          season,
          week,
          myScore: a.points,
          oppScore: b.points,
          result: aResult,
        });
        getMeetings(meetings, mb.userId, ma.userId).push({
          season,
          week,
          myScore: b.points,
          oppScore: a.points,
          result: bResult,
        });
      }
    }
  }

  return {
    managers: [...allManagers.values()].sort((a, b) =>
      a.username.localeCompare(b.username),
    ),
    cells,
    meetings,
  };
}
