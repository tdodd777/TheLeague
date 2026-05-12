import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildPickValueIndex,
  DEFAULT_FUTURE_PICK_SLOT,
  deriveParamsFromLeague,
  fetchValues,
  parsePickName,
  resolvePickValue,
  withDefaultSlot,
} from "../src/lib/fantasycalc";
import type { FantasyCalcEntry } from "../src/lib/fantasycalc";
import { sleeper, walkLeagueChain } from "../src/lib/sleeper";
import type {
  SleeperLeague,
  SleeperRoster,
  SleeperTransaction,
  SleeperUser,
} from "../src/lib/sleeper";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(REPO_ROOT, "data");
const LEAGUE_CACHE_DIR = path.join(DATA_DIR, "league-cache");
const SNAPSHOT_DIR = path.join(DATA_DIR, "values-snapshots");

const SLEEPER_LEAGUE_ID = process.env["SLEEPER_LEAGUE_ID"];
if (!SLEEPER_LEAGUE_ID) {
  throw new Error(
    "SLEEPER_LEAGUE_ID is not set. Add it to your .env file. See SETUP.md.",
  );
}

async function writeJson(file: string, data: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function maxIngestWeek(league: SleeperLeague): number {
  // Pre-draft / drafting: off-season trades and free-agent moves still post,
  // tagged as leg=1. Fetch a couple of weeks of transactions so the feed
  // stays current. (Matchups/projections won't exist; the loop skips empty.)
  if (league.status === "pre_draft" || league.status === "drafting") return 2;
  const playoffStart = league.settings.playoff_week_start || 15;
  return Math.max(playoffStart + 3, 18);
}

async function ingestSeason(league: SleeperLeague): Promise<{
  users: SleeperUser[];
  rosters: SleeperRoster[];
  transactionsCount: number;
  matchupWeeks: number;
}> {
  const dir = path.join(LEAGUE_CACHE_DIR, league.season);
  console.log(
    `\n[${league.season}] ingest league_id=${league.league_id} status=${league.status}`,
  );
  await rm(dir, { recursive: true, force: true });

  const [users, rosters, tradedPicks, drafts] = await Promise.all([
    sleeper.users(league.league_id),
    sleeper.rosters(league.league_id),
    sleeper.tradedPicks(league.league_id),
    sleeper.drafts(league.league_id),
  ]);

  await writeJson(path.join(dir, "league.json"), league);
  await writeJson(path.join(dir, "users.json"), users);
  await writeJson(path.join(dir, "rosters.json"), rosters);
  await writeJson(path.join(dir, "traded_picks.json"), tradedPicks);
  await writeJson(path.join(dir, "drafts.json"), drafts);

  // Playoff brackets are only published once the season is in playoffs / done.
  // For pre-draft seasons the endpoint returns an empty array — we skip those.
  if (league.status === "in_season" || league.status === "complete") {
    const [winners, losers] = await Promise.all([
      sleeper.winnersBracket(league.league_id).catch((err: unknown) => {
        console.log(
          `  ⚠ winners_bracket ${league.season}:`,
          err instanceof Error ? err.message : err,
        );
        return [];
      }),
      sleeper.losersBracket(league.league_id).catch((err: unknown) => {
        console.log(
          `  ⚠ losers_bracket ${league.season}:`,
          err instanceof Error ? err.message : err,
        );
        return [];
      }),
    ]);
    if (winners.length > 0) {
      await writeJson(path.join(dir, "winners_bracket.json"), winners);
    }
    if (losers.length > 0) {
      await writeJson(path.join(dir, "losers_bracket.json"), losers);
    }
  }

  for (const draft of drafts) {
    const [picks, draftTradedPicks] = await Promise.all([
      sleeper.draftPicks(draft.draft_id),
      sleeper.draftTradedPicks(draft.draft_id),
    ]);
    await writeJson(
      path.join(dir, `draft-${draft.draft_id}.json`),
      draft,
    );
    await writeJson(
      path.join(dir, `draft-${draft.draft_id}-picks.json`),
      picks,
    );
    await writeJson(
      path.join(dir, `draft-${draft.draft_id}-traded-picks.json`),
      draftTradedPicks,
    );
  }

  const maxWeek = maxIngestWeek(league);
  let matchupWeeks = 0;
  let transactionsCount = 0;
  let projectionWeeks = 0;

  for (let week = 1; week <= maxWeek; week += 1) {
    const [matchups, transactions, projections] = await Promise.all([
      sleeper.matchups(league.league_id, week),
      sleeper.transactions(league.league_id, week),
      sleeper.projections(league.season, week).catch(
        (err: unknown) => {
          // Projections for some past weeks may 404 (rare). Don't block ingest.
          console.log(`  ⚠ projections ${league.season}/wk${week}:`, err instanceof Error ? err.message : err);
          return null;
        },
      ),
    ]);
    if (matchups.length > 0) {
      await writeJson(
        path.join(dir, `matchups-${String(week).padStart(2, "0")}.json`),
        matchups,
      );
      matchupWeeks += 1;
    }
    if (transactions.length > 0) {
      await writeJson(
        path.join(dir, `transactions-${String(week).padStart(2, "0")}.json`),
        transactions as SleeperTransaction[],
      );
      transactionsCount += transactions.length;
    }
    if (projections && Object.keys(projections).length > 0) {
      // Slim payload: keep only `pts_ppr` (this league is full PPR with
      // bonus_rec_te=0, so pts_ppr is exactly the projected score). Drop
      // the rest of the per-player stat block to keep git size tractable.
      const slim: Record<string, number> = {};
      for (const [playerId, stats] of Object.entries(projections)) {
        const pts = stats?.["pts_ppr"];
        if (typeof pts === "number" && Number.isFinite(pts)) {
          slim[playerId] = Math.round(pts * 100) / 100;
        }
      }
      if (Object.keys(slim).length > 0) {
        await writeJson(
          path.join(dir, `projections-${String(week).padStart(2, "0")}.json`),
          slim,
        );
        projectionWeeks += 1;
      }
    }
  }

  console.log(
    `  rosters=${rosters.length} users=${users.length} traded_picks=${tradedPicks.length} drafts=${drafts.length} matchup_weeks=${matchupWeeks} tx=${transactionsCount} projection_weeks=${projectionWeeks}`,
  );

  return {
    users,
    rosters,
    transactionsCount,
    matchupWeeks,
  };
}

function todayUtc(): string {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

interface ValuesSnapshot {
  fetched_at: string;
  league_id: string;
  params: {
    dynasty: ReturnType<typeof deriveParamsFromLeague>;
    redraft: ReturnType<typeof deriveParamsFromLeague>;
  };
  dynasty: FantasyCalcEntry[];
  redraft: FantasyCalcEntry[];
}

async function snapshotFantasyCalc(league: SleeperLeague): Promise<ValuesSnapshot> {
  const dynastyParams = deriveParamsFromLeague(league, true);
  const redraftParams = deriveParamsFromLeague(league, false);
  console.log(
    `\n[fantasycalc] dynasty params: ${JSON.stringify(dynastyParams)}`,
  );
  console.log(`[fantasycalc] redraft params: ${JSON.stringify(redraftParams)}`);

  const [dynasty, redraft] = await Promise.all([
    fetchValues(dynastyParams),
    fetchValues(redraftParams),
  ]);

  const snapshot: ValuesSnapshot = {
    fetched_at: new Date().toISOString(),
    league_id: league.league_id,
    params: { dynasty: dynastyParams, redraft: redraftParams },
    dynasty,
    redraft,
  };

  const out = path.join(SNAPSHOT_DIR, `${todayUtc()}.json`);
  await writeJson(out, snapshot);
  console.log(
    `  dynasty_entries=${dynasty.length} redraft_entries=${redraft.length} -> ${path.relative(REPO_ROOT, out)}`,
  );
  return snapshot;
}

async function refreshPlayers(): Promise<void> {
  console.log(`\n[players] fetching /players/nfl (~5 MB)…`);
  const players = await sleeper.players();
  const ids = Object.keys(players);
  const out = path.join(DATA_DIR, "players.json");
  await writeJson(out, players);
  console.log(
    `  player_count=${ids.length} -> ${path.relative(REPO_ROOT, out)}`,
  );
}

function summarizeSamples(snapshot: ValuesSnapshot): void {
  console.log(`\n=== samples ===`);
  const top = snapshot.dynasty.slice(0, 5);
  console.log(`top 5 dynasty assets:`);
  for (const e of top) {
    console.log(
      `  #${e.overallRank.toString().padStart(2, " ")} ${e.player.position.padEnd(2)} ${e.player.name.padEnd(28)} value=${e.value} trend30=${e.trend30Day}`,
    );
  }

  const picks = snapshot.dynasty.filter((e) => e.player.position === "PICK");
  const parsed = picks
    .map((e) => parsePickName(e.player.name))
    .filter((p): p is NonNullable<typeof p> => p !== null);
  console.log(`\npick parse: ${parsed.length}/${picks.length}`);

  const index = buildPickValueIndex(snapshot.dynasty);
  console.log(
    `pick index: ${index.bySlot.size} slot-keyed, ${index.byRound.size} round-keyed`,
  );

  // Demonstrate exact-slot resolution. Every pick is canonicalised to
  // "YYYY Pick R.PP"; future-year picks borrow the league default slot.
  const examples: Array<{ label: string; ident: ReturnType<typeof parsePickName> }> = [
    { label: "current-year exact", ident: { season: 2026, round: 1, slot: 4 } },
    { label: "current-year mid (slot=7)", ident: { season: 2026, round: 1, slot: DEFAULT_FUTURE_PICK_SLOT } },
    { label: `2027 1st (defaulted slot=${DEFAULT_FUTURE_PICK_SLOT})`, ident: withDefaultSlot({ season: 2027, round: 1, slot: null }) },
    { label: `2028 2nd (defaulted slot=${DEFAULT_FUTURE_PICK_SLOT})`, ident: withDefaultSlot({ season: 2028, round: 2, slot: null }) },
    { label: `2029 3rd (defaulted slot=${DEFAULT_FUTURE_PICK_SLOT})`, ident: withDefaultSlot({ season: 2029, round: 3, slot: null }) },
  ];
  console.log(`\nresolver demo:`);
  for (const ex of examples) {
    if (!ex.ident) continue;
    const r = resolvePickValue(ex.ident, index);
    if (!r) {
      console.log(`  ${ex.label.padEnd(36)} (no entry)`);
      continue;
    }
    console.log(
      `  ${ex.label.padEnd(36)} "${r.entry.player.name}" value=${r.value} source=${r.source}`,
    );
  }

  const unparsed = picks
    .filter((e) => parsePickName(e.player.name) === null)
    .slice(0, 5);
  if (unparsed.length) {
    console.log(`  ⚠ unparsed examples:`);
    for (const e of unparsed) console.log(`    "${e.player.name}"`);
  }
}

async function main(): Promise<void> {
  console.log(`league-page ingest`);
  console.log(`  league_id=${SLEEPER_LEAGUE_ID}`);
  console.log(`  data_dir=${path.relative(REPO_ROOT, DATA_DIR)}`);

  const chain = await walkLeagueChain(SLEEPER_LEAGUE_ID);
  const seasons = chain.map((c) => c.season).join(", ");
  console.log(`\n[chain] ${chain.length} seasons: ${seasons}`);

  for (const { league } of chain) {
    await ingestSeason(league);
  }

  const head = chain[0];
  if (!head) throw new Error("league chain empty");
  const snapshot = await snapshotFantasyCalc(head.league);

  await refreshPlayers();

  summarizeSamples(snapshot);

  console.log(`\ndone.`);
}

main().catch((err: unknown) => {
  console.error(`\nFAIL:`, err);
  process.exit(1);
});
