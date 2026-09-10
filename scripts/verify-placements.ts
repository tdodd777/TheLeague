/* eslint-disable no-console */
import fs from "node:fs";
import { getSeasonPlacements } from "../src/lib/data/brackets";

interface User { user_id: string; display_name: string }
interface Roster { roster_id: number; owner_id: string }

async function main(): Promise<void> {
  for (const yr of ["2023", "2024", "2025"]) {
    const users: User[] = JSON.parse(fs.readFileSync(`./data/league-cache/${yr}/users.json`, "utf8"));
    const rosters: Roster[] = JSON.parse(fs.readFileSync(`./data/league-cache/${yr}/rosters.json`, "utf8"));
    const userBy: Record<string, string> = Object.fromEntries(users.map((u) => [u.user_id, u.display_name]));
    const nameOf = (id: number | null): string => {
      if (id === null) return "—";
      const r = rosters.find((r) => r.roster_id === id);
      return r ? userBy[r.owner_id] ?? "?" : "?";
    };
    const p = await getSeasonPlacements(yr);
    console.log(yr, "champion:", p.champion, "(" + nameOf(p.champion) + ")");
    console.log(yr, "runnerUp:", p.runnerUp, "(" + nameOf(p.runnerUp) + ")");
    console.log(yr, "third:", p.third, "(" + nameOf(p.third) + ")");
    console.log(yr, "toiletBowl:", p.toiletBowlChamp, "(" + nameOf(p.toiletBowlChamp) + ")");
    console.log(yr, "all places:");
    for (const [r, pl] of [...p.byRosterId.entries()].sort((a, b) => a[1] - b[1])) {
      console.log("  " + pl + ".", nameOf(r), "(roster " + r + ")");
    }
    console.log();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
