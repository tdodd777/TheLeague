import {
  type BiggestTradeSummary,
  type FeedTransaction,
  getBiggestTradeOfSeason,
  getManagers,
  getManagerTradeStats,
  getStandings,
  getTransactionsFeed,
  getWeeklyPointsByRoster,
  latestCachedMatchupWeek,
  listCachedSeasons,
  readDrafts,
  summarizeSides,
} from "@/lib/data";
import {
  buildDynastyRankings,
  buildHistoricalSeasonContext,
  buildSeasonRankings,
} from "@/lib/rankings/engine";
import type {
  SeasonPowerBreakdown,
  ValuedAsset,
} from "@/lib/rankings/types";
import type { SleeperDraft, SleeperLeague } from "@/lib/sleeper/types";
import type { Manager, SeasonStanding } from "@/lib/types";

export type Lede =
  | {
      kind: "champion";
      champ: SeasonStanding;
      weekly: number[];
      topMover: ValuedAsset | null;
      lastSeason: string;
    }
  | { kind: "draft"; draft: SleeperDraft }
  | {
      kind: "luckVerdict";
      entry: SeasonPowerBreakdown;
      flavor: "lucky" | "cooked";
    }
  | {
      kind: "crowned";
      champ: SeasonStanding;
      runnerUp: SeasonStanding | null;
      season: string;
    };

export interface TrendMover {
  name: string;
  position: string;
  team: string | null;
  trend30Day: number;
  value: number;
}

export type TrendInsight =
  | {
      kind: "activeTrader";
      manager: Manager;
      trades: number;
      partners: number;
      playersReceived: number;
      playersGiven: number;
      picksReceived: number;
      picksGiven: number;
      // FAAB transfer totals are still computed (trade-stats.ts) but the
      // active-trader StatGrid no longer renders them. Kept so a fork that
      // re-enables FAAB display doesn't have to re-thread the type.
      faabReceived: number;
      faabGiven: number;
      netAssets: number;
    }
  | {
      kind: "streak";
      manager: Manager;
      tone: "hot" | "cold";
      lastThreeAvg: number;
      leagueWeeklyAvg: number;
      /** Last up to 5 weekly point totals, oldest → newest. */
      recentWeeks: number[];
      actualWins: number;
      actualLosses: number;
      allPlayWins: number;
      allPlayLosses: number;
      season: string;
    }
  | {
      kind: "dynastyMover";
      manager: Manager;
      trend30Day: number;
      direction: "up" | "down";
      starterValue: number;
      total: number;
      /** Top 5 starters by abs(trend30Day) within the roster. */
      movers: TrendMover[];
    }
  | {
      kind: "biggestTrade";
      summary: BiggestTradeSummary;
      oneLiner: string;
      season: string;
    }
  | {
      kind: "playoffRace";
      teamSix: SeasonStanding;
      teamSeven: SeasonStanding;
      winsGap: number;
      pfGap: number;
      seedCutoff: number;
      /** Bubble: seeds (cutoff-1) through (cutoff+2) for context. */
      bubble: SeasonStanding[];
    }
  | {
      kind: "lineupIQ";
      manager: Manager;
      ratio: number;
      pf: number;
      ppts: number;
      wins: number;
      losses: number;
      season: string;
    };

/**
 * In-season-only "Sunday strip": the actionable insights an owner cares about
 * mid-game. Rendered between live scoreboard and recent moves on regular-season
 * Sundays. Either field may be null if its underlying insight isn't available.
 */
export interface SundayStrip {
  playoffRace: Extract<TrendInsight, { kind: "playoffRace" }> | null;
  dynastyMover: Extract<TrendInsight, { kind: "dynastyMover" }> | null;
}

export interface LandingInsights {
  phaseLine: string;
  lede: Lede | null;
  /** In-season Sunday-mode strip; null off-season. */
  sundayStrip: SundayStrip | null;
  trends: TrendInsight[];
  activity: FeedTransaction[];
}

const ACTIVITY_LIMIT = 7;

function daysBetween(fromMs: number, toMs: number): number {
  return Math.ceil((toMs - fromMs) / (1000 * 60 * 60 * 24));
}

function pluralWeeks(n: number): string {
  return `${n} week${n === 1 ? "" : "s"}`;
}

function pluralDays(n: number): string {
  return `${n} day${n === 1 ? "" : "s"}`;
}

export async function getLandingInsights(
  season: string,
  league: SleeperLeague,
): Promise<LandingInsights> {
  const seasons = await listCachedSeasons();
  // Most recent prior season, used for off-season storylines.
  const lastCompleted = seasons.find((s) => s !== season) ?? null;

  const [phaseLine, lede, trends, feed] = await Promise.all([
    buildPhaseLine(season, league),
    buildLede(season, league, lastCompleted),
    buildTrends(season, league, lastCompleted),
    getTransactionsFeed(),
  ]);

  // In-season Sunday strip: surface playoff race + dynasty mover as first-class
  // signals. Both come from `trends` so we don't recompute. When the strip is
  // populated, the playoff-race trend is removed from Pulse (Pulse drops to 3).
  let sundayStrip: SundayStrip | null = null;
  let prunedTrends = trends;
  if (league.status === "in_season") {
    const playoffRace =
      (trends.find((t) => t.kind === "playoffRace") as
        | Extract<TrendInsight, { kind: "playoffRace" }>
        | undefined) ?? null;
    const dynastyMover =
      (trends.find((t) => t.kind === "dynastyMover") as
        | Extract<TrendInsight, { kind: "dynastyMover" }>
        | undefined) ?? null;
    if (playoffRace || dynastyMover) {
      sundayStrip = { playoffRace, dynastyMover };
      // Promote playoffRace out of the Pulse — keep dynastyMover, since the
      // strip frames it as direction, the Pulse frames it as roster context.
      prunedTrends = trends.filter((t) => t.kind !== "playoffRace");
    }
  }

  return {
    phaseLine,
    lede,
    sundayStrip,
    trends: prunedTrends,
    activity: feed.slice(0, ACTIVITY_LIMIT),
  };
}

async function buildPhaseLine(
  season: string,
  league: SleeperLeague,
): Promise<string> {
  switch (league.status) {
    case "pre_draft": {
      const drafts = await readDrafts(season).catch(() => []);
      const startMs = drafts[0]?.start_time ?? null;
      if (startMs && startMs > Date.now()) {
        return `Pre-draft · rookie draft in ${pluralDays(daysBetween(Date.now(), startMs))}`;
      }
      return "Pre-draft";
    }
    case "drafting":
      return "Draft underway";
    case "in_season": {
      const latest = await latestCachedMatchupWeek();
      const week = latest?.season === season ? latest.week : null;
      const deadline = league.settings.trade_deadline;
      if (week !== null && deadline > week) {
        return `Week ${week} · trade window closes in ${pluralWeeks(deadline - week)}`;
      }
      if (week !== null) return `Week ${week}`;
      return "In season";
    }
    case "complete": {
      const standings = await getStandings(season);
      const champ = standings[0];
      if (!champ) return "Season complete";
      return `Season complete · ${champ.manager.displayName} crowned`;
    }
  }
}

async function buildLede(
  season: string,
  league: SleeperLeague,
  lastCompleted: string | null,
): Promise<Lede | null> {
  switch (league.status) {
    case "pre_draft":
      return buildChampionLede(lastCompleted);
    case "drafting": {
      const drafts = await readDrafts(season).catch(() => []);
      const draft = drafts[0];
      if (!draft) return null;
      return { kind: "draft", draft };
    }
    case "in_season":
      return buildLuckVerdictLede();
    case "complete": {
      const standings = await getStandings(season);
      const champ = standings[0];
      if (!champ) return null;
      return {
        kind: "crowned",
        champ,
        runnerUp: standings[1] ?? null,
        season,
      };
    }
  }
}

async function buildChampionLede(
  lastCompleted: string | null,
): Promise<Lede | null> {
  if (!lastCompleted) return null;
  const standings = await getStandings(lastCompleted);
  const champ = standings[0];
  if (!champ) return null;

  const weeklyMap = await getWeeklyPointsByRoster(lastCompleted);
  const weekly = weeklyMap.get(champ.rosterId) ?? [];

  // Champion's biggest 30-day mover among current starters (dynasty mode).
  let topMover: ValuedAsset | null = null;
  try {
    const dynasty = await buildDynastyRankings();
    const champRoster = dynasty.rosters.find(
      (r) => r.manager.userId === champ.manager.userId,
    );
    if (champRoster) {
      const sorted = [...champRoster.starters]
        .map((s) => s.asset)
        .filter((a) => Number.isFinite(a.trend30Day) && a.trend30Day !== 0)
        .sort((a, b) => Math.abs(b.trend30Day) - Math.abs(a.trend30Day));
      topMover = sorted[0] ?? null;
    }
  } catch {
    topMover = null;
  }

  return {
    kind: "champion",
    champ,
    weekly,
    topMover,
    lastSeason: lastCompleted,
  };
}

async function buildLuckVerdictLede(): Promise<Lede | null> {
  try {
    const { power } = await buildSeasonRankings();
    const valid = power.filter((p) => p.gamesPlayed > 0);
    if (valid.length === 0) return null;
    const sorted = [...valid].sort(
      (a, b) => Math.abs(b.scheduleLuck) - Math.abs(a.scheduleLuck),
    );
    const top = sorted[0]!;
    // Need at least half a game of luck to be a story worth telling.
    if (Math.abs(top.scheduleLuck) < 0.5) return null;
    return {
      kind: "luckVerdict",
      entry: top,
      flavor: top.scheduleLuck > 0 ? "lucky" : "cooked",
    };
  } catch {
    return null;
  }
}

async function buildTrends(
  season: string,
  league: SleeperLeague,
  lastCompleted: string | null,
): Promise<TrendInsight[]> {
  const status = league.status;
  // Streak / lineup-IQ data lives on whichever season has games on the books.
  const playSeason: string | null =
    status === "in_season" || status === "complete" ? season : lastCompleted;

  // Run insight pickers in parallel — each is independent.
  const [
    activeTrader,
    hotStreak,
    dynastyMover,
    biggestTrade,
    playoffRace,
    lineupIQ,
    coldStreak,
  ] = await Promise.all([
    pickActiveTrader(season),
    playSeason ? pickStreak(playSeason, "hot") : Promise.resolve(null),
    pickDynastyMover(),
    playSeason ? pickBiggestTrade(playSeason) : pickBiggestTrade(season),
    status === "in_season"
      ? pickPlayoffRace(season, league)
      : Promise.resolve(null),
    status === "drafting" && playSeason
      ? pickLineupIQ(playSeason)
      : Promise.resolve(null),
    playSeason ? pickStreak(playSeason, "cold") : Promise.resolve(null),
  ]);

  // Build the slate per phase. Slot 4 rotates by phase; if the primary slot 4
  // miss happens, fall back through (cold streak → biggest trade → lineup IQ).
  const slate: Array<TrendInsight | null> = [
    activeTrader,
    hotStreak,
    dynastyMover,
  ];

  if (status === "in_season") {
    slate.push(playoffRace ?? coldStreak ?? biggestTrade);
  } else if (status === "drafting") {
    slate.push(lineupIQ ?? biggestTrade ?? coldStreak);
  } else {
    // pre_draft / complete
    slate.push(biggestTrade ?? coldStreak ?? lineupIQ);
  }

  const out = slate.filter((t): t is TrendInsight => t !== null);

  // Top-up if anything came back null.
  const fallbacks = [coldStreak, biggestTrade, lineupIQ].filter(
    (t): t is TrendInsight => t !== null,
  );
  for (const f of fallbacks) {
    if (out.length >= 4) break;
    if (!out.some((t) => t.kind === f.kind)) out.push(f);
  }

  return out.slice(0, 4);
}

async function pickActiveTrader(season: string): Promise<TrendInsight | null> {
  const managers = await getManagers(season);
  if (managers.list.length === 0) return null;
  const stats = await Promise.all(
    managers.list.map(async (m) => ({
      manager: m,
      stats: await getManagerTradeStats(m.userId),
    })),
  );
  stats.sort((a, b) => {
    if (b.stats.trades !== a.stats.trades) return b.stats.trades - a.stats.trades;
    return b.stats.partners - a.stats.partners;
  });
  const top = stats[0];
  if (!top || top.stats.trades === 0) return null;
  return {
    kind: "activeTrader",
    manager: top.manager,
    trades: top.stats.trades,
    partners: top.stats.partners,
    playersReceived: top.stats.playersReceived,
    playersGiven: top.stats.playersGiven,
    picksReceived: top.stats.picksReceived,
    picksGiven: top.stats.picksGiven,
    faabReceived: top.stats.faabReceived,
    faabGiven: top.stats.faabGiven,
    netAssets: top.stats.netAssets,
  };
}

async function pickStreak(
  season: string,
  tone: "hot" | "cold",
): Promise<TrendInsight | null> {
  let power: SeasonPowerBreakdown[] = [];
  try {
    const ctx = await buildHistoricalSeasonContext(season);
    power = ctx.power;
  } catch {
    return null;
  }
  const valid = power.filter((p) => p.gamesPlayed > 0 && p.last3Index > 0);
  if (valid.length === 0) return null;
  const sorted = [...valid].sort((a, b) =>
    tone === "hot" ? b.last3Index - a.last3Index : a.last3Index - b.last3Index,
  );
  const top = sorted[0]!;

  const weeklyMap = await getWeeklyPointsByRoster(season);
  const myWeekly = weeklyMap.get(top.rosterId) ?? [];
  const lastThree = myWeekly.slice(-3);
  if (lastThree.length === 0) return null;
  const lastThreeAvg =
    lastThree.reduce((s, n) => s + n, 0) / lastThree.length;
  const recentWeeks = myWeekly.slice(-5);

  let totalSum = 0;
  let totalCount = 0;
  for (const arr of weeklyMap.values()) {
    for (const v of arr) {
      if (Number.isFinite(v)) {
        totalSum += v;
        totalCount += 1;
      }
    }
  }
  const leagueWeeklyAvg = totalCount > 0 ? totalSum / totalCount : 0;

  return {
    kind: "streak",
    manager: top.manager,
    tone,
    lastThreeAvg,
    leagueWeeklyAvg,
    recentWeeks,
    actualWins: top.actualWins,
    actualLosses: top.actualLosses,
    allPlayWins: top.allPlayWins,
    allPlayLosses: top.allPlayLosses,
    season,
  };
}

async function pickDynastyMover(): Promise<TrendInsight | null> {
  try {
    const dynasty = await buildDynastyRankings();
    if (dynasty.rosters.length === 0) return null;
    const sorted = [...dynasty.rosters].sort(
      (a, b) => Math.abs(b.trend30Day) - Math.abs(a.trend30Day),
    );
    const top = sorted[0];
    if (!top || top.trend30Day === 0) return null;

    const movers: TrendMover[] = [...top.starters]
      .map((s) => ({
        name: s.asset.name,
        position: s.asset.position,
        team: s.asset.team,
        trend30Day: s.asset.trend30Day,
        value: s.asset.value,
      }))
      .filter((m) => Number.isFinite(m.trend30Day) && m.trend30Day !== 0)
      .sort((a, b) => Math.abs(b.trend30Day) - Math.abs(a.trend30Day))
      .slice(0, 5);

    return {
      kind: "dynastyMover",
      manager: top.manager,
      trend30Day: top.trend30Day,
      direction: top.trend30Day > 0 ? "up" : "down",
      starterValue: top.starterValue,
      total: top.total,
      movers,
    };
  } catch {
    return null;
  }
}

async function pickBiggestTrade(
  preferredSeason: string,
): Promise<TrendInsight | null> {
  const seasons = await listCachedSeasons();
  const idx = seasons.indexOf(preferredSeason);
  // Walk forward (older) from the preferred season, then wrap to anything older.
  const ordered = idx >= 0 ? [...seasons.slice(idx), ...seasons.slice(0, idx)] : seasons;
  for (const s of ordered) {
    const summary = await getBiggestTradeOfSeason(s);
    if (summary) {
      return {
        kind: "biggestTrade",
        summary,
        oneLiner: summarizeSides(summary.trade),
        season: s,
      };
    }
  }
  return null;
}

async function pickPlayoffRace(
  season: string,
  league: SleeperLeague,
): Promise<TrendInsight | null> {
  const standings = await getStandings(season);
  const cutoff = league.settings.playoff_teams ?? 6;
  if (standings.length <= cutoff) return null;
  const teamSix = standings[cutoff - 1];
  const teamSeven = standings[cutoff];
  if (!teamSix || !teamSeven) return null;
  // Bubble = seed (cutoff-1) through (cutoff+2). Roughly 4 teams flanking the cut.
  const lo = Math.max(0, cutoff - 2);
  const hi = Math.min(standings.length, cutoff + 2);
  const bubble = standings.slice(lo, hi);
  return {
    kind: "playoffRace",
    teamSix,
    teamSeven,
    winsGap: teamSix.wins - teamSeven.wins,
    pfGap: teamSix.pf - teamSeven.pf,
    seedCutoff: cutoff,
    bubble,
  };
}

async function pickLineupIQ(season: string): Promise<TrendInsight | null> {
  const standings = await getStandings(season);
  if (standings.length === 0) return null;
  const ranked = standings
    .map((s) => ({
      standing: s,
      ratio: s.ppts > 0 ? Math.min(1, s.pf / s.ppts) : 0,
    }))
    .filter((r) => r.ratio > 0)
    .sort((a, b) => b.ratio - a.ratio);
  const top = ranked[0];
  if (!top) return null;
  return {
    kind: "lineupIQ",
    manager: top.standing.manager,
    ratio: top.ratio,
    pf: top.standing.pf,
    ppts: top.standing.ppts,
    wins: top.standing.wins,
    losses: top.standing.losses,
    season,
  };
}
