import type { SleeperRoster } from "@/lib/sleeper";
import type { SeasonStanding } from "@/lib/types";

import { readRosters } from "./cache";
import { getManagers } from "./managers";

function decimalsTo(int: number, decimal: number | undefined): number {
  if (typeof decimal !== "number") return int;
  return int + decimal / 100;
}

function pointsFor(roster: SleeperRoster): number {
  return decimalsTo(roster.settings.fpts, roster.settings.fpts_decimal);
}

function pointsAgainst(roster: SleeperRoster): number {
  if (typeof roster.settings.fpts_against !== "number") return 0;
  return decimalsTo(
    roster.settings.fpts_against,
    roster.settings.fpts_against_decimal,
  );
}

function potentialPoints(roster: SleeperRoster): number {
  if (typeof roster.settings.ppts !== "number") return 0;
  return decimalsTo(roster.settings.ppts, roster.settings.ppts_decimal);
}

export async function getStandings(season: string): Promise<SeasonStanding[]> {
  const [rosters, managers] = await Promise.all([
    readRosters(season),
    getManagers(season),
  ]);

  const standings: SeasonStanding[] = [];
  for (const r of rosters) {
    const manager = managers.byRosterId.get(r.roster_id);
    if (!manager) continue;
    standings.push({
      rosterId: r.roster_id,
      manager,
      wins: r.settings.wins,
      losses: r.settings.losses,
      ties: r.settings.ties,
      pf: pointsFor(r),
      pa: pointsAgainst(r),
      ppts: potentialPoints(r),
      streak: r.metadata?.["streak"] ?? null,
      record: r.metadata?.["record"] ?? null,
      division: r.settings.division ?? null,
    });
  }

  standings.sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.ties !== a.ties) return b.ties - a.ties;
    return b.pf - a.pf;
  });

  return standings;
}
