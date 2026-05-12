import { ArrowUpRight, ChevronDown } from "lucide-react";
import Link from "next/link";

import { LiveScoreboard } from "@/components/live/LiveScoreboard";
import {
  Card,
  Kicker,
  ManagerAvatar,
  Pill,
  Sparkline,
} from "@/components/ui";
import { LEAGUE_BLURB } from "@/config/about";
import { LEAGUE_NAME } from "@/config/site";
import { cn } from "@/lib/cn";
import { getCurrentLeague, getManagers } from "@/lib/data";
import type { FeedTransaction } from "@/lib/data";
import type { Manager } from "@/lib/types";
import {
  getLandingInsights,
  type Lede,
  type SundayStrip as SundayStripData,
  type TrendInsight,
} from "@/lib/landing/insights";

export default async function HomePage() {
  const { season, league } = await getCurrentLeague();
  const managers = await getManagers(season);
  const insights = await getLandingInsights(season, league);

  const liveManagers = managers.list.map((m) => ({
    rosterId: m.rosterId,
    username: m.username,
    displayName: m.displayName,
    avatarUrl: m.avatarUrl,
  }));

  const staticHero = (
    <section className="relative overflow-hidden border-b border-border">
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 pt-12 pb-12 sm:pt-20 sm:pb-16 flex flex-col gap-8">
        <div className="flex flex-col gap-5 max-w-3xl">
          <Kicker>{insights.phaseLine}</Kicker>
          <h1 className="font-display text-foreground text-[3.5rem] sm:text-[6rem] lg:text-[7rem] leading-[0.9] tracking-tight -ml-1">
            {LEAGUE_NAME}
          </h1>
          <p className="text-foreground-muted text-base sm:text-[17px] leading-relaxed max-w-2xl">
            {LEAGUE_BLURB}
          </p>
        </div>
        <div className="editorial-rule mt-2" aria-hidden>
          ❦
        </div>
      </div>
    </section>
  );

  const sortedManagers = [...managers.list].sort((a, b) =>
    a.displayName.localeCompare(b.displayName),
  );

  // Sunday-mode (regular season): live scoreboard + actionable strip lead;
  // Lede gets demoted to the bottom. Off-season: editorial Lede leads.
  const isInSeason = league.status === "in_season";
  const recentMoves = isInSeason
    ? insights.activity.slice(0, 5)
    : insights.activity;

  const ledeSection = insights.lede ? (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-12 sm:mt-16">
      <LedeBlock lede={insights.lede} />
    </section>
  ) : null;

  const sundayStripSection =
    isInSeason && insights.sundayStrip ? (
      <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-10 sm:mt-12">
        <SundayStripBlock strip={insights.sundayStrip} />
      </section>
    ) : null;

  const pulseSection = insights.trends.length > 0 ? (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-12 sm:mt-16">
      <Kicker>The Pulse</Kicker>
      <ul className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {insights.trends.map((t, i) => (
          <li key={`${t.kind}-${i}`}>
            <TrendCard trend={t} />
          </li>
        ))}
      </ul>
    </section>
  ) : null;

  const recentMovesSection = recentMoves.length > 0 ? (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-12 sm:mt-16">
      <div className="flex items-baseline justify-between gap-3">
        <Kicker>Recent Moves</Kicker>
        <Link
          href="/transactions"
          className="text-[11px] text-foreground-muted hover:text-foreground transition-colors flex items-center gap-1"
        >
          All transactions <ArrowUpRight size={12} strokeWidth={1.75} />
        </Link>
      </div>
      <ul className="mt-4 border-y border-rule divide-y divide-rule">
        {recentMoves.map((tx) => (
          <ActivityRow key={tx.transactionId} tx={tx} />
        ))}
      </ul>
    </section>
  ) : null;

  const managersSection = (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-12 sm:mt-16 pb-12">
      <div className="flex items-baseline justify-between gap-3">
        <Kicker>The Managers</Kicker>
        <Link
          href="/managers"
          className="text-[11px] text-foreground-muted hover:text-foreground transition-colors flex items-center gap-1"
        >
          All managers <ArrowUpRight size={12} strokeWidth={1.75} />
        </Link>
      </div>
      <ol className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8">
        {sortedManagers.map((m, i) => (
          <li
            key={m.userId}
            className="border-b border-rule last:border-b-0 sm:[&:nth-last-child(2)]:border-b-0 lg:[&:nth-last-child(3)]:border-b-0"
          >
            <Link
              href={`/managers/${m.username}`}
              className="flex items-baseline gap-3 py-2.5 group"
              style={{ viewTransitionName: `manager-card-${m.userId}` }}
            >
              <span className="text-[10px] tabular text-foreground-subtle w-6 shrink-0">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="font-display text-2xl text-foreground leading-none group-hover:text-accent transition-colors truncate">
                {m.displayName}
              </span>
              <span className="ml-auto text-[11px] text-foreground-subtle truncate tabular hidden sm:inline">
                @{m.username}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );

  return (
    <main className="relative">
      <LiveScoreboard
        leagueId={league.league_id}
        managers={liveManagers}
        fallback={staticHero}
      />

      {isInSeason ? (
        <>
          {/* Sunday-mode: actionable in-season insights lead. */}
          {sundayStripSection}
          {recentMovesSection}
          {pulseSection}
          {managersSection}
          {ledeSection}
        </>
      ) : (
        <>
          {/* Off-season: editorial Lede leads, Pulse + activity behind it. */}
          {ledeSection}
          {pulseSection}
          {recentMovesSection}
          {managersSection}
        </>
      )}
    </main>
  );
}

/* ============================================================ */
/*  SUNDAY STRIP                                                */
/* ============================================================ */

function SundayStripBlock({ strip }: { strip: SundayStripData }) {
  const { playoffRace, dynastyMover } = strip;
  if (!playoffRace && !dynastyMover) return null;

  return (
    <div className="border-y border-rule">
      {playoffRace ? <PlayoffRaceLine entry={playoffRace} /> : null}
      {dynastyMover ? <DynastyMoverLine entry={dynastyMover} /> : null}
    </div>
  );
}

function PlayoffRaceLine({
  entry,
}: {
  entry: Extract<TrendInsight, { kind: "playoffRace" }>;
}) {
  const six = entry.teamSix;
  const seven = entry.teamSeven;
  const gapLine =
    entry.winsGap === 0
      ? "tied at the bubble"
      : `${entry.winsGap}-game gap${
          entry.pfGap !== 0
            ? ` · ${entry.pfGap > 0 ? "+" : ""}${entry.pfGap.toFixed(1)} PF`
            : ""
        }`;
  return (
    <Link
      href="/standings"
      className="block py-4 border-b border-rule last:border-b-0 hover:bg-row-hover transition-colors group"
    >
      <div className="flex items-baseline gap-3 mb-2">
        <span className="kicker">Playoff race · seed {entry.seedCutoff}</span>
        <span className="text-[11px] text-foreground-subtle tabular ml-auto group-hover:text-foreground transition-colors">
          Standings →
        </span>
      </div>
      <div className="flex items-center gap-3 sm:gap-5">
        <ManagerAvatar manager={six.manager} size={32} ring="subtle" />
        <span className="font-display text-2xl sm:text-3xl text-foreground leading-none truncate">
          {six.manager.displayName}
        </span>
        <span className="text-[11px] tabular text-foreground-subtle hidden sm:inline">
          {six.wins}–{six.losses}
          {six.ties ? `–${six.ties}` : ""}
        </span>
        <span className="text-foreground-subtle text-[13px] mx-1">vs</span>
        <span className="font-display text-2xl sm:text-3xl text-foreground-muted leading-none truncate">
          {seven.manager.displayName}
        </span>
        <span className="text-[11px] tabular text-foreground-subtle hidden sm:inline">
          {seven.wins}–{seven.losses}
          {seven.ties ? `–${seven.ties}` : ""}
        </span>
        <ManagerAvatar manager={seven.manager} size={32} ring="subtle" />
      </div>
      <p className="text-[11px] tabular text-foreground-subtle mt-2">
        {gapLine}
      </p>
    </Link>
  );
}

function DynastyMoverLine({
  entry,
}: {
  entry: Extract<TrendInsight, { kind: "dynastyMover" }>;
}) {
  const arrow = entry.direction === "up" ? "▲" : "▼";
  const tone = entry.direction === "up" ? "text-positive" : "text-negative";
  const flavor =
    entry.direction === "up" ? "rising the most" : "falling the most";
  return (
    <Link
      href="/rankings/dynasty"
      className="block py-4 hover:bg-row-hover transition-colors group"
    >
      <div className="flex items-baseline gap-3 mb-2">
        <span className="kicker">Dynasty mover · 30d</span>
        <span className="text-[11px] text-foreground-subtle tabular ml-auto group-hover:text-foreground transition-colors">
          Dynasty rankings →
        </span>
      </div>
      <div className="flex items-center gap-3 sm:gap-5">
        <ManagerAvatar manager={entry.manager} size={32} ring="subtle" />
        <span className="font-display text-2xl sm:text-3xl text-foreground leading-none truncate">
          {entry.manager.displayName}
        </span>
        <span className={cn("font-display text-2xl tabular leading-none", tone)}>
          {arrow} {Math.abs(entry.trend30Day).toFixed(0)}
        </span>
        <span className="text-[11px] tabular text-foreground-subtle hidden sm:inline">
          starter value · {flavor}
        </span>
      </div>
    </Link>
  );
}

/* ============================================================ */
/*  LEDE                                                        */
/* ============================================================ */

function LedeBlock({ lede }: { lede: Lede }) {
  switch (lede.kind) {
    case "champion":
      return <LedeChampion lede={lede} />;
    case "draft":
      return <LedeDraft lede={lede} />;
    case "luckVerdict":
      return <LedeLuckVerdict lede={lede} />;
    case "crowned":
      return <LedeCrowned lede={lede} />;
  }
}

function LedeChampion({
  lede,
}: {
  lede: Extract<Lede, { kind: "champion" }>;
}) {
  const { champ, weekly, topMover, lastSeason } = lede;
  const max = weekly.length > 0 ? Math.max(...weekly) : 0;
  const min = weekly.length > 0 ? Math.min(...weekly) : 0;

  return (
    <article className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 items-start">
      <div className="lg:col-span-6 flex flex-col gap-5">
        <Kicker>The Reigning · {lastSeason} Champion</Kicker>
        <Link
          href={`/managers/${champ.manager.username}`}
          className="group flex items-center gap-5"
        >
          <ManagerAvatar
            manager={champ.manager}
            size={96}
            ring="gradient"
            priority
          />
          <div className="flex flex-col min-w-0">
            <span className="font-display text-4xl sm:text-5xl text-foreground leading-[0.95] truncate group-hover:text-accent transition-colors">
              {champ.manager.displayName}
            </span>
            <span className="text-sm text-foreground-muted mt-1.5 truncate">
              @{champ.manager.username}
            </span>
            <div className="flex items-center gap-3 mt-3">
              <Pill tone="accent" size="md">
                {champ.wins}–{champ.losses}
                {champ.ties ? `–${champ.ties}` : ""}
              </Pill>
              <span className="text-sm text-foreground-muted tabular">
                {champ.pf.toFixed(1)} PF
              </span>
            </div>
          </div>
        </Link>
      </div>

      <div className="lg:col-span-6 flex flex-col gap-4">
        {weekly.length >= 2 && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[10px] uppercase tracking-[0.18em] text-foreground-subtle">
                Weekly PF · {lastSeason}
              </span>
              <span className="text-xs text-foreground-muted tabular">
                max {max.toFixed(1)} · min {min.toFixed(1)}
              </span>
            </div>
            <Sparkline
              values={weekly}
              width={520}
              height={56}
              stroke="var(--accent-primary)"
              fillGradient
              className="text-accent w-full"
              ariaLabel={`${champ.manager.displayName} weekly points for ${lastSeason}`}
            />
          </div>
        )}

        {topMover && (
          <div className="text-sm text-foreground-muted leading-relaxed pt-3 border-t border-border">
            <span className="text-[10px] uppercase tracking-[0.18em] text-foreground-subtle mr-2">
              Roster mover · 30d
            </span>
            <span className="font-medium text-foreground">{topMover.name}</span>
            <span className="text-foreground-subtle"> · </span>
            <span
              className={cn(
                "tabular",
                topMover.trend30Day > 0 ? "text-positive" : "text-negative",
              )}
            >
              {topMover.trend30Day > 0 ? "+" : ""}
              {topMover.trend30Day.toFixed(0)}
            </span>
          </div>
        )}
      </div>
    </article>
  );
}

function LedeDraft({ lede }: { lede: Extract<Lede, { kind: "draft" }> }) {
  const { draft } = lede;
  const start = formatStartTime(draft.start_time);
  return (
    <article className="flex flex-col gap-3 max-w-2xl">
      <Kicker>The Draft</Kicker>
      <h2 className="font-display text-4xl sm:text-5xl text-foreground leading-[0.95]">
        On the clock
      </h2>
      <p className="text-foreground-muted leading-relaxed">
        {draft.settings.rounds}-round {draft.type} draft · starts {start}
      </p>
    </article>
  );
}

function LedeLuckVerdict({
  lede,
}: {
  lede: Extract<Lede, { kind: "luckVerdict" }>;
}) {
  const { entry, flavor } = lede;
  const expectedW = Math.round(entry.expectedWins);
  const expectedL = Math.round(entry.gamesPlayed - entry.expectedWins);
  const actualRecord = `${entry.actualWins}–${entry.actualLosses}${entry.actualTies ? `–${entry.actualTies}` : ""}`;
  const detail =
    flavor === "lucky"
      ? "Punching above weight — record outruns the all-play"
      : "Punching below weight — getting hosed by the schedule";

  return (
    <article className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <div className="lg:col-span-7 flex flex-col gap-5">
        <Kicker>The Verdict</Kicker>
        <Link
          href={`/managers/${entry.manager.username}`}
          className="group flex items-center gap-5"
        >
          <ManagerAvatar
            manager={entry.manager}
            size={88}
            ring="subtle"
            priority
          />
          <div className="flex flex-col min-w-0">
            <span className="font-display text-3xl sm:text-4xl text-foreground leading-[0.95] truncate group-hover:text-accent transition-colors">
              {entry.manager.displayName}
            </span>
            <span className="text-sm text-foreground-muted mt-1.5">
              {detail}
            </span>
          </div>
        </Link>
      </div>
      <div className="lg:col-span-5 grid grid-cols-2 gap-6">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-[0.18em] text-foreground-subtle">
            Actual
          </span>
          <span className="font-display text-3xl tabular text-foreground mt-1">
            {actualRecord}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-[0.18em] text-foreground-subtle">
            Expected
          </span>
          <span className="font-display text-3xl tabular text-foreground-muted mt-1">
            ~{expectedW}–{expectedL}
          </span>
        </div>
      </div>
    </article>
  );
}

function LedeCrowned({
  lede,
}: {
  lede: Extract<Lede, { kind: "crowned" }>;
}) {
  const { champ, runnerUp, season } = lede;
  return (
    <article className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
      <div className="lg:col-span-7 flex flex-col gap-4">
        <Kicker>The {season} Champion</Kicker>
        <Link
          href={`/managers/${champ.manager.username}`}
          className="group flex items-center gap-5"
        >
          <ManagerAvatar
            manager={champ.manager}
            size={96}
            ring="gradient"
            priority
          />
          <div>
            <div className="font-display text-4xl sm:text-5xl text-foreground leading-[0.95] group-hover:text-accent transition-colors truncate">
              {champ.manager.displayName}
            </div>
            <div className="mt-2 flex items-center gap-3">
              <Pill tone="accent" size="md">
                {champ.wins}–{champ.losses}
                {champ.ties ? `–${champ.ties}` : ""}
              </Pill>
              <span className="text-sm text-foreground-muted tabular">
                {champ.pf.toFixed(1)} PF
              </span>
            </div>
          </div>
        </Link>
      </div>
      {runnerUp && (
        <div className="lg:col-span-5 flex flex-col gap-2 lg:border-l lg:border-border lg:pl-6">
          <span className="text-[10px] uppercase tracking-[0.18em] text-foreground-subtle">
            Runner-up
          </span>
          <Link
            href={`/managers/${runnerUp.manager.username}`}
            className="flex items-center gap-3 group"
          >
            <ManagerAvatar manager={runnerUp.manager} size={36} ring="subtle" />
            <div className="min-w-0">
              <div className="font-display text-xl text-foreground-muted truncate group-hover:text-accent transition-colors">
                {runnerUp.manager.displayName}
              </div>
              <div className="text-xs text-foreground-subtle tabular">
                {runnerUp.wins}–{runnerUp.losses}
                {runnerUp.ties ? `–${runnerUp.ties}` : ""} ·{" "}
                {runnerUp.pf.toFixed(1)} PF
              </div>
            </div>
          </Link>
        </div>
      )}
    </article>
  );
}

/* ============================================================ */
/*  TRENDS                                                      */
/* ============================================================ */

function TrendCard({ trend }: { trend: TrendInsight }) {
  switch (trend.kind) {
    case "activeTrader":
      return (
        <ExpandableTrend
          kicker="Most active trader"
          headline={
            <ManagerLine manager={trend.manager}>
              {trend.trades} trade{trend.trades === 1 ? "" : "s"} ·{" "}
              {trend.partners} partner
              {trend.partners === 1 ? "" : "s"}
            </ManagerLine>
          }
          source={{
            href: `/managers/${trend.manager.username}`,
            label: "View manager",
          }}
        >
          <StatGrid
            items={[
              {
                label: "Players received",
                value: String(trend.playersReceived),
              },
              {
                label: "Players given",
                value: String(trend.playersGiven),
              },
              { label: "Picks received", value: String(trend.picksReceived) },
              { label: "Picks given", value: String(trend.picksGiven) },
              {
                label: "Net assets",
                value:
                  (trend.netAssets > 0 ? "+" : "") + trend.netAssets.toString(),
                tone:
                  trend.netAssets > 0
                    ? "positive"
                    : trend.netAssets < 0
                      ? "negative"
                      : "neutral",
              },
            ]}
          />
        </ExpandableTrend>
      );

    case "streak": {
      const verdict =
        trend.tone === "hot" ? "Hottest closer" : "Coldest finish";
      const delta =
        trend.leagueWeeklyAvg > 0
          ? trend.lastThreeAvg - trend.leagueWeeklyAvg
          : 0;
      return (
        <ExpandableTrend
          kicker={`${verdict} · ${trend.season}`}
          headline={
            <ManagerLine manager={trend.manager}>
              {trend.lastThreeAvg.toFixed(1)} avg over last 3 ·{" "}
              <span
                className={cn(
                  "tabular",
                  delta >= 0 ? "text-positive" : "text-negative",
                )}
              >
                {delta >= 0 ? "+" : ""}
                {delta.toFixed(1)} vs league
              </span>
            </ManagerLine>
          }
          source={{
            href: `/managers/${trend.manager.username}`,
            label: "View manager",
          }}
        >
          {trend.recentWeeks.length > 0 && (
            <div className="mb-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-foreground-subtle mb-1.5">
                Recent weeks · oldest → newest
              </div>
              <ul className="flex flex-wrap gap-1.5">
                {trend.recentWeeks.map((p, i) => (
                  <li
                    key={i}
                    className="text-xs tabular px-2 py-1 rounded bg-foreground/[0.04] text-foreground-muted"
                  >
                    {p.toFixed(1)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <StatGrid
            items={[
              {
                label: "Last-3 avg",
                value: trend.lastThreeAvg.toFixed(1),
              },
              {
                label: "League weekly avg",
                value: trend.leagueWeeklyAvg.toFixed(1),
              },
              {
                label: "Actual record",
                value: `${trend.actualWins}–${trend.actualLosses}`,
              },
              {
                label: "All-play record",
                value: `${trend.allPlayWins}–${trend.allPlayLosses}`,
              },
            ]}
          />
        </ExpandableTrend>
      );
    }

    case "dynastyMover": {
      const arrow = trend.direction === "up" ? "▲" : "▼";
      const tone = trend.direction === "up" ? "text-positive" : "text-negative";
      return (
        <ExpandableTrend
          kicker="Biggest dynasty mover · 30d"
          headline={
            <ManagerLine manager={trend.manager}>
              <span className={cn("tabular", tone)}>
                {arrow} {Math.abs(trend.trend30Day).toFixed(0)} starter value
              </span>
            </ManagerLine>
          }
          source={{
            href: `/rankings/dynasty`,
            label: "Dynasty rankings",
          }}
        >
          {trend.movers.length > 0 && (
            <div className="mb-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-foreground-subtle mb-1.5">
                Top starters by 30d trend
              </div>
              <ul className="flex flex-col gap-1">
                {trend.movers.map((m, i) => (
                  <li
                    key={i}
                    className="flex items-baseline justify-between gap-3 text-xs"
                  >
                    <span className="text-foreground truncate">
                      <span className="text-foreground-subtle text-[10px] mr-1.5 tabular">
                        {m.position}
                      </span>
                      {m.name}
                    </span>
                    <span
                      className={cn(
                        "tabular shrink-0",
                        m.trend30Day > 0
                          ? "text-positive"
                          : m.trend30Day < 0
                            ? "text-negative"
                            : "text-foreground-muted",
                      )}
                    >
                      {m.trend30Day > 0 ? "+" : ""}
                      {m.trend30Day.toFixed(0)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <StatGrid
            items={[
              {
                label: "Starter value",
                value: trend.starterValue.toFixed(0),
              },
              { label: "Total roster value", value: trend.total.toFixed(0) },
            ]}
          />
        </ExpandableTrend>
      );
    }

    case "biggestTrade": {
      const { participants, trade } = trend.summary;
      const headline = (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="flex -space-x-2">
              {participants.slice(0, 3).map((m) => (
                <span
                  key={m.userId}
                  className="ring-2 ring-surface rounded-full inline-block"
                >
                  <ManagerAvatar manager={m} size={28} ring="none" />
                </span>
              ))}
            </div>
            <span className="text-xs text-foreground-muted tabular">
              {participants
                .map((m) => `@${m.username}`)
                .slice(0, 2)
                .join(" ↔ ")}
              {participants.length > 2 ? ` +${participants.length - 2}` : ""}
            </span>
          </div>
          <p className="text-xs text-foreground-muted line-clamp-2 leading-relaxed">
            {trend.oneLiner}
          </p>
        </div>
      );
      return (
        <ExpandableTrend
          kicker={`Biggest trade · ${trend.season}`}
          kickerRight={`${trade.assetCount} assets`}
          headline={headline}
          source={{
            href: `/transactions`,
            label: "All transactions",
          }}
        >
          <div className="text-[10px] uppercase tracking-[0.18em] text-foreground-subtle mb-2">
            Sides
          </div>
          <ul className="flex flex-col gap-2">
            {trade.sides.map((side) => {
              const players = side.players.map((p) => p.name);
              const picks = side.picks.map(
                (p) => `${p.season} R${p.round}`,
              );
              const items = [...players, ...picks];
              return (
                <li
                  key={side.rosterId}
                  className="flex flex-col gap-1 pb-2 border-b border-border last:border-b-0 last:pb-0"
                >
                  <div className="flex items-center gap-2">
                    <ManagerAvatar
                      manager={side.manager}
                      size={20}
                      ring="subtle"
                    />
                    <span className="text-xs font-medium text-foreground">
                      @{side.manager.username}
                    </span>
                    <span className="text-[10px] text-foreground-subtle tabular ml-auto">
                      +{side.assetCount}
                    </span>
                  </div>
                  <p className="text-xs text-foreground-muted leading-relaxed">
                    {items.length > 0 ? items.join(", ") : "—"}
                  </p>
                </li>
              );
            })}
          </ul>
        </ExpandableTrend>
      );
    }

    case "playoffRace":
      return (
        <ExpandableTrend
          kicker={`Playoff race · seed ${trend.seedCutoff}`}
          headline={
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <ManagerAvatar
                    manager={trend.teamSix.manager}
                    size={28}
                    ring="subtle"
                  />
                  <span className="font-display text-base text-foreground truncate">
                    {trend.teamSix.manager.displayName}
                  </span>
                </div>
                <span className="text-foreground-subtle text-xs px-1">vs</span>
                <div className="flex items-center gap-2 min-w-0 justify-end">
                  <span className="font-display text-base text-foreground-muted truncate">
                    {trend.teamSeven.manager.displayName}
                  </span>
                  <ManagerAvatar
                    manager={trend.teamSeven.manager}
                    size={28}
                    ring="subtle"
                  />
                </div>
              </div>
              <p className="text-xs text-foreground-muted tabular">
                {trend.winsGap === 0 ? "tied" : `${trend.winsGap}-game gap`}
                {trend.pfGap !== 0
                  ? ` · ${trend.pfGap > 0 ? "+" : ""}${trend.pfGap.toFixed(1)} PF`
                  : ""}
              </p>
            </div>
          }
          source={{ href: `/standings`, label: "Standings" }}
        >
          <div className="text-[10px] uppercase tracking-[0.18em] text-foreground-subtle mb-2">
            Bubble
          </div>
          <ul className="flex flex-col gap-1">
            {trend.bubble.map((s, idx) => {
              const seed = Math.max(0, trend.seedCutoff - 2) + idx + 1;
              const isCutoff = seed === trend.seedCutoff;
              return (
                <li
                  key={s.rosterId}
                  className={cn(
                    "flex items-center gap-2 text-xs",
                    isCutoff && "text-foreground",
                  )}
                >
                  <span className="text-[10px] tabular text-foreground-subtle w-5 shrink-0">
                    {String(seed).padStart(2, "0")}
                  </span>
                  <span className="truncate flex-1">
                    {s.manager.displayName}
                  </span>
                  <span className="tabular text-foreground-muted shrink-0">
                    {s.wins}–{s.losses}
                    {s.ties ? `–${s.ties}` : ""}
                  </span>
                  <span className="tabular text-foreground-subtle shrink-0">
                    {s.pf.toFixed(1)} PF
                  </span>
                </li>
              );
            })}
          </ul>
        </ExpandableTrend>
      );

    case "lineupIQ":
      return (
        <ExpandableTrend
          kicker={`Lineup IQ leader · ${trend.season}`}
          headline={
            <ManagerLine manager={trend.manager}>
              {(trend.ratio * 100).toFixed(1)}% of potential
            </ManagerLine>
          }
          source={{
            href: `/managers/${trend.manager.username}`,
            label: "View manager",
          }}
        >
          <StatGrid
            items={[
              { label: "Points for", value: trend.pf.toFixed(1) },
              { label: "Potential points", value: trend.ppts.toFixed(1) },
              {
                label: "Lineup IQ",
                value: `${(trend.ratio * 100).toFixed(1)}%`,
              },
              {
                label: "Record",
                value: `${trend.wins}–${trend.losses}`,
              },
            ]}
          />
        </ExpandableTrend>
      );
  }
}

/* ----- Trend card primitives ------------------------------- */

interface ExpandableTrendProps {
  kicker: string;
  kickerRight?: string;
  headline: React.ReactNode;
  source: { href: string; label: string };
  children: React.ReactNode;
}

function ExpandableTrend({
  kicker,
  kickerRight,
  headline,
  source,
  children,
}: ExpandableTrendProps) {
  return (
    <Card variant="default" padding="md" className="h-full">
      <details className="group">
        <summary
          className="list-none cursor-pointer outline-none [&::-webkit-details-marker]:hidden focus-visible:ring-2 focus-visible:ring-accent rounded-md"
          aria-label={`${kicker} — toggle details`}
        >
          <div className="flex items-baseline justify-between gap-2">
            <Kicker>{kicker}</Kicker>
            <div className="flex items-center gap-2">
              {kickerRight && (
                <span className="text-[10px] text-foreground-subtle tabular uppercase tracking-[0.12em]">
                  {kickerRight}
                </span>
              )}
              <ChevronDown
                size={14}
                strokeWidth={1.75}
                className="text-foreground-subtle group-open:rotate-180 transition-transform shrink-0"
                aria-hidden
              />
            </div>
          </div>
          <div className="mt-3">{headline}</div>
        </summary>
        <div className="mt-4 pt-4 border-t border-border flex flex-col gap-3">
          {children}
          <Link
            href={source.href}
            className="text-xs text-foreground-muted hover:text-accent transition-colors flex items-center gap-1 self-start"
          >
            {source.label} <ArrowUpRight size={12} strokeWidth={1.75} />
          </Link>
        </div>
      </details>
    </Card>
  );
}

function ManagerLine({
  manager,
  children,
}: {
  manager: Manager;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <ManagerAvatar manager={manager} size={36} ring="subtle" />
      <div className="flex flex-col min-w-0">
        <span className="font-display text-xl text-foreground truncate leading-tight">
          {manager.displayName}
        </span>
        <span className="text-xs text-foreground-muted tabular">{children}</span>
      </div>
    </div>
  );
}

interface StatGridItem {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative";
}

function StatGrid({ items }: { items: StatGridItem[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
      {items.map((it) => (
        <div key={it.label} className="flex flex-col">
          <dt className="text-[10px] uppercase tracking-[0.18em] text-foreground-subtle">
            {it.label}
          </dt>
          <dd
            className={cn(
              "text-sm tabular",
              it.tone === "positive"
                ? "text-positive"
                : it.tone === "negative"
                  ? "text-negative"
                  : "text-foreground",
            )}
          >
            {it.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/* ============================================================ */
/*  ACTIVITY                                                    */
/* ============================================================ */

function ActivityRow({ tx }: { tx: FeedTransaction }) {
  const verb =
    tx.type === "trade"
      ? "Trade"
      : tx.type === "waiver"
        ? "Waiver"
        : "Free agent";
  return (
    <li className="flex items-center gap-3 py-3">
      <div className="flex -space-x-2 shrink-0">
        {tx.parties.slice(0, 3).map((p) => (
          <span
            key={p.rosterId}
            className="ring-2 ring-background rounded-full inline-block"
          >
            <ManagerAvatar manager={p.manager} size={28} ring="none" />
          </span>
        ))}
      </div>
      <div className="flex-1 min-w-0">
        <span className="font-display italic text-[15px] text-foreground-muted mr-2.5">
          {verb}
        </span>
        <span className="text-[13px] text-foreground">{describeTx(tx)}</span>
      </div>
      <span className="text-[11px] text-foreground-subtle tabular shrink-0">
        {fmtDate(tx.statusUpdated)}
      </span>
    </li>
  );
}

function describeTx(tx: FeedTransaction): string {
  if (tx.type === "trade") {
    const sides = tx.parties.map((p) => {
      const items: string[] = [];
      for (const a of p.adds) items.push(a.name);
      for (const pk of p.picksReceived)
        items.push(`${pk.season} R${pk.round}`);
      const summary = items.length > 0 ? items.join(", ") : "—";
      return `${p.manager.displayName} got ${summary}`;
    });
    return sides.join("  ↔  ");
  }
  if (tx.type === "waiver") {
    const p = tx.parties[0];
    if (!p) return "Waiver claim";
    const adds = p.adds.map((a) => a.name).join(", ");
    const drops = p.drops.map((d) => d.name).join(", ");
    const head = adds
      ? `${p.manager.displayName} claimed ${adds}`
      : `${p.manager.displayName} placed claim`;
    return drops ? `${head} (dropped ${drops})` : head;
  }
  // free_agent
  const p = tx.parties[0];
  if (!p) return "Free agent move";
  const adds = p.adds.map((a) => a.name).join(", ");
  const drops = p.drops.map((d) => d.name).join(", ");
  const head = adds
    ? `${p.manager.displayName} added ${adds}`
    : `${p.manager.displayName} moved`;
  return drops ? `${head} (dropped ${drops})` : head;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function fmtDate(ms: number): string {
  const d = new Date(ms);
  // UTC methods so server and client agree on the rendered string.
  const m = MONTHS[d.getUTCMonth()] ?? "?";
  const day = d.getUTCDate();
  const year = d.getUTCFullYear();
  const nowYear = new Date().getUTCFullYear();
  if (year === nowYear) return `${m} ${day}`;
  return `${m} ${day}, '${String(year).slice(2)}`;
}

function formatStartTime(ms: number | null): string {
  if (!ms) return "TBA";
  const d = new Date(ms);
  const m = MONTHS[d.getUTCMonth()] ?? "?";
  const day = d.getUTCDate();
  const year = d.getUTCFullYear();
  return `${m} ${day}, ${year}`;
}
