import Link from "next/link";

import {
  Card,
  Kicker,
  ManagerAvatar,
  Pill,
  SectionHeader,
  Sparkline,
  StatTile,
} from "@/components/ui";
import { MetricExplainer } from "@/components/rankings/MetricExplainer";
import { RankingsCaveats } from "@/components/rankings/RankingsCaveats";
import {
  buildHistoricalSeasonContext,
  buildSeasonRankings,
  type SeasonPowerBreakdown,
} from "@/lib/rankings";
import { listCachedSeasons } from "@/lib/data";

export const dynamic = "force-static";

export default async function SeasonRankingsPage() {
  const { result, power } = await buildSeasonRankings();
  const seasons = await listCachedSeasons();
  const lastCompleted = seasons.find((s) => s !== result.season) ?? null;

  // Pre-season detection: no roster has played a game.
  const totalGames = power.reduce((s, r) => s + r.gamesPlayed, 0);
  const preSeason = totalGames === 0;

  // For pre-season, fetch last completed season so we can show last-year's
  // schedule luck / lineup IQ / all-play (the "verdict on last year") strip.
  const last = lastCompleted ? await buildHistoricalSeasonContext(lastCompleted) : null;

  // Top of leaderboard.
  const top = power[0];
  const bottom = power[power.length - 1];

  // Schedule luck callouts from the last completed season.
  const lastSeasonPower = last?.power ?? [];
  const lastByLuck = [...lastSeasonPower].sort((a, b) => b.scheduleLuck - a.scheduleLuck);
  const luckiest = lastByLuck[0];
  const unluckiest = lastByLuck[lastByLuck.length - 1];

  return (
    <>
      <section className="relative overflow-hidden border-b border-border">
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 pt-10 pb-10 sm:pt-14 sm:pb-12">
          <SectionHeader
            kicker={`${result.season} season · snapshot ${result.snapshotDate}${preSeason ? " · pre-draft, value-only" : ""}`}
            title="Season Power"
            description={
              preSeason
                ? `Pre-draft for ${result.season}: power is built from optimal-redraft starting lineups only. Form components (PPG, last 3 weeks, all-play) kick in once games begin.`
                : "Composite of optimal redraft lineup, points-per-game vs league mean, last-three-weeks form, and all-play winning percentage."
            }
            size="lg"
          />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-6">
        <MetricExplainer
          title="Season Power"
          summary="Who's playing the best football right now. A composite of four signals — only the first applies pre-season; the others kick in once games are played."
          bullets={[
            { term: "Optimal redraft lineup", def: "Best legal starting lineup using current asset values. Pre-season, this is everything." },
            { term: "Points per game vs. mean", def: "How far above or below the league average a roster is scoring." },
            { term: "Last-three form", def: "Weight on the most recent three games to catch hot/cold streaks." },
            { term: "All-play win %", def: "What your record would be if you played every team every week." },
          ]}
        />
      </section>

      {/* Headline stats */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile
          label={`Top ${result.season}`}
          value={top?.total ?? 0}
          precision={1}
          accent="primary"
          subValue={top ? `@${top.manager.username}` : "—"}
        />
        <StatTile
          label={`Bottom ${result.season}`}
          value={bottom?.total ?? 0}
          precision={1}
          subValue={bottom ? `@${bottom.manager.username}` : "—"}
          animate={false}
        />
        {luckiest ? (
          <StatTile
            label={`Luckiest ${lastCompleted}`}
            value={luckiest.scheduleLuck}
            precision={1}
            prefix={luckiest.scheduleLuck >= 0 ? "+" : ""}
            suffix=" W"
            accent="secondary"
            subValue={`@${luckiest.manager.username} · vs all-play`}
            animate={false}
          />
        ) : null}
        {unluckiest ? (
          <StatTile
            label={`Robbed ${lastCompleted}`}
            value={unluckiest.scheduleLuck}
            precision={1}
            prefix={unluckiest.scheduleLuck >= 0 ? "+" : ""}
            suffix=" W"
            subValue={`@${unluckiest.manager.username} · the schedule did them dirty`}
            animate={false}
          />
        ) : null}
      </section>

      {/* The ranking */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-8 sm:mt-10 flex flex-col gap-3">
        <Kicker>The Ranking</Kicker>
        <div className="grid grid-cols-1 gap-3">
          {power.map((row, i) => (
            <SeasonRow key={row.rosterId} row={row} rank={i + 1} preSeason={preSeason} />
          ))}
        </div>
      </section>

      {/* Last season verdict */}
      {last && lastCompleted ? (
        <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-12 sm:mt-16 flex flex-col gap-4">
          <SectionHeader
            kicker={`Verdict on ${lastCompleted}`}
            title="Lineup IQ, Expected Wins, Schedule Luck"
            description={`How last season actually played out. Lineup IQ = points scored ÷ potential points (1.000 = perfect lineups). Expected wins = your all-play win rate × 14 games. Schedule luck = actual − expected.`}
            size="md"
          />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {[...lastSeasonPower].sort((a, b) => b.scheduleLuck - a.scheduleLuck).map((row) => (
              <LastSeasonRow key={row.rosterId} row={row} />
            ))}
          </div>
        </section>
      ) : null}

      {/* Caveats */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-12 mb-16">
        <RankingsCaveats />
      </section>
    </>
  );
}

function SeasonRow({
  row,
  rank,
  preSeason,
}: {
  row: SeasonPowerBreakdown;
  rank: number;
  preSeason: boolean;
}) {
  const recordLabel = `${row.actualWins}-${row.actualLosses}${row.actualTies ? `-${row.actualTies}` : ""}`;
  const apLabel = `${row.allPlayWins}-${row.allPlayLosses}`;

  return (
    <Card variant="default" padding="md" as="article">
      <div className="grid grid-cols-12 gap-4 items-start">
        <div className="col-span-12 sm:col-span-4 flex items-center gap-3">
          <span className="font-display text-3xl text-foreground-subtle tabular leading-none w-8 text-center">
            {rank.toString().padStart(2, "0")}
          </span>
          <Link
            href={`/managers/${row.manager.username}`}
            className="flex items-center gap-3 group min-w-0"
            style={{ viewTransitionName: `manager-card-${row.manager.userId}` }}
          >
            <ManagerAvatar manager={row.manager} size={44} ring="subtle" />
            <span className="flex flex-col min-w-0">
              <span className="text-sm font-medium text-foreground group-hover:text-accent transition-colors truncate">
                {row.manager.displayName}
              </span>
              <span className="text-xs text-foreground-subtle truncate">
                @{row.manager.username}
              </span>
            </span>
          </Link>
        </div>

        <div className="col-span-12 sm:col-span-4 flex flex-col gap-1.5 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-3xl text-foreground tabular leading-none">
              {row.total.toFixed(1)}
            </span>
            <span className="text-xs text-foreground-subtle">power</span>
          </div>
          {row.weeklyPower.length >= 2 ? (
            <Sparkline
              values={row.weeklyPower}
              width={260}
              height={26}
              stroke="var(--accent-primary)"
              fillGradient
              className="text-accent w-full"
            />
          ) : (
            <span className="text-[11px] text-foreground-subtle">
              {preSeason ? "no games yet — value-only" : "—"}
            </span>
          )}
        </div>

        <div className="col-span-12 sm:col-span-4 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
          <Tally label="Optimal start" value={row.optimalStarterValue.toLocaleString("en-US", { maximumFractionDigits: 0 })} accent />
          <Tally label="Record" value={preSeason ? "—" : recordLabel} />
          <Tally label="PPG idx" value={row.ppgIndex.toFixed(2)} />
          <Tally label="All-play" value={preSeason ? "—" : apLabel} />
          <Tally label="Last 3 idx" value={row.last3Index.toFixed(2)} />
          <Tally label="All-play %" value={preSeason ? "—" : `${(row.allPlayPct * 100).toFixed(1)}%`} />
        </div>
      </div>
    </Card>
  );
}

function Tally({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 min-w-0">
      <span className="text-[10px] uppercase tracking-[0.16em] text-foreground-subtle truncate">
        {label}
      </span>
      <span
        className={
          accent
            ? "tabular text-foreground font-medium"
            : "tabular text-foreground-muted"
        }
      >
        {value}
      </span>
    </div>
  );
}

function LastSeasonRow({ row }: { row: SeasonPowerBreakdown }) {
  const luckTone =
    row.scheduleLuck > 0.5 ? "positive" : row.scheduleLuck < -0.5 ? "negative" : "neutral";
  return (
    <Card variant="default" padding="md">
      <div className="flex items-center gap-3">
        <Link
          href={`/managers/${row.manager.username}`}
          className="flex items-center gap-3 min-w-0 flex-1 group"
        >
          <ManagerAvatar manager={row.manager} size={36} ring="subtle" />
          <span className="flex flex-col min-w-0">
            <span className="text-sm font-medium text-foreground truncate group-hover:text-accent transition-colors">
              {row.manager.displayName}
            </span>
            <span className="text-[11px] text-foreground-subtle tabular truncate">
              {row.actualWins}-{row.actualLosses}
              {row.actualTies ? `-${row.actualTies}` : ""}
              {" · all-play "}
              {row.allPlayWins}-{row.allPlayLosses}
            </span>
          </span>
        </Link>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <Pill tone={luckTone} size="sm">
            {row.scheduleLuck >= 0 ? "+" : "−"}
            {Math.abs(row.scheduleLuck).toFixed(1)} luck
          </Pill>
          <span className="text-[11px] text-foreground-muted tabular">
            LIQ {row.lineupIQ === null ? "—" : (row.lineupIQ * 100).toFixed(1)}%
          </span>
        </div>
      </div>
    </Card>
  );
}
