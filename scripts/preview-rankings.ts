import {
  buildDynastyRankings,
  buildSeasonRankings,
  buildHistoricalSeasonContext,
} from "../src/lib/rankings/engine";

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}
function rpad(s: string, n: number): string {
  return s.length >= n ? s : " ".repeat(n - s.length) + s;
}

async function main(): Promise<void> {
  const dynasty = await buildDynastyRankings();
  console.log(
    `Dynasty rankings — season ${dynasty.season} · snapshot ${dynasty.snapshotDate}`,
  );
  console.log(
    pad("#", 3) + pad("Manager", 22) + rpad("Total", 9) + rpad("Start", 9) + rpad("Bench", 9) + rpad("Resv", 8) + rpad("Taxi", 8) + rpad("Picks", 9) + rpad("Stud+", 8),
  );
  dynasty.rosters.forEach((r, i) => {
    console.log(
      pad(String(i + 1), 3) +
        pad(r.manager.username, 22) +
        rpad(r.total.toFixed(0), 9) +
        rpad(r.starterValue.toFixed(0), 9) +
        rpad(r.benchValue.toFixed(0), 9) +
        rpad(r.reserveValue.toFixed(0), 8) +
        rpad(r.taxiValue.toFixed(0), 8) +
        rpad(r.pickValue.toFixed(0), 9) +
        rpad(r.studBonus.toFixed(0), 8),
    );
  });

  console.log();
  const { result: seasonR, power } = await buildSeasonRankings();
  console.log(
    `Season rankings — season ${seasonR.season} · snapshot ${seasonR.snapshotDate}`,
  );
  console.log(
    pad("#", 3) + pad("Manager", 22) + rpad("Power", 9) + rpad("OSV", 9) + rpad("PPGi", 8) + rpad("L3i", 8) + rpad("AP%", 8) + rpad("Lck", 8),
  );
  power.forEach((r, i) => {
    console.log(
      pad(String(i + 1), 3) +
        pad(r.manager.username, 22) +
        rpad(r.total.toFixed(2), 9) +
        rpad(r.optimalStarterValue.toFixed(0), 9) +
        rpad(r.ppgIndex.toFixed(2), 8) +
        rpad(r.last3Index.toFixed(2), 8) +
        rpad((r.allPlayPct * 100).toFixed(1), 8) +
        rpad(r.scheduleLuck.toFixed(2), 8),
    );
  });

  console.log();
  const ctx = await buildHistoricalSeasonContext("2025");
  console.log("2025 Season Power (historical, with results):");
  console.log(
    pad("#", 3) + pad("Manager", 22) + rpad("Power", 9) + rpad("Actual", 9) + rpad("AllPlay", 9) + rpad("Lck", 8) + rpad("LIQ", 8),
  );
  ctx.power.forEach((r, i) => {
    console.log(
      pad(String(i + 1), 3) +
        pad(r.manager.username, 22) +
        rpad(r.total.toFixed(2), 9) +
        rpad(`${r.actualWins}-${r.actualLosses}${r.actualTies ? "-" + r.actualTies : ""}`, 9) +
        rpad(`${r.allPlayWins}-${r.allPlayLosses}`, 9) +
        rpad(r.scheduleLuck.toFixed(2), 8) +
        rpad(r.lineupIQ === null ? "—" : r.lineupIQ.toFixed(3), 8),
    );
  });
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
