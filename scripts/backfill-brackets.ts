/* eslint-disable no-console */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { sleeper } from "../src/lib/sleeper";
import type { SleeperLeague } from "../src/lib/sleeper";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");
const LEAGUE_CACHE_DIR = path.join(REPO_ROOT, "data", "league-cache");

async function writeJson(file: string, data: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data, null, 2) + "\n", "utf8");
}

async function main(): Promise<void> {
  const { readdir } = await import("node:fs/promises");
  const seasons = (await readdir(LEAGUE_CACHE_DIR, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  for (const season of seasons) {
    const dir = path.join(LEAGUE_CACHE_DIR, season);
    const league = JSON.parse(
      await readFile(path.join(dir, "league.json"), "utf8"),
    ) as SleeperLeague;
    if (league.status !== "in_season" && league.status !== "complete") {
      console.log(`[${season}] skipped (status=${league.status})`);
      continue;
    }
    const [winners, losers] = await Promise.all([
      sleeper.winnersBracket(league.league_id),
      sleeper.losersBracket(league.league_id),
    ]);
    if (winners.length > 0) {
      await writeJson(path.join(dir, "winners_bracket.json"), winners);
    }
    if (losers.length > 0) {
      await writeJson(path.join(dir, "losers_bracket.json"), losers);
    }
    console.log(
      `[${season}] winners=${winners.length} losers=${losers.length}`,
    );
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
