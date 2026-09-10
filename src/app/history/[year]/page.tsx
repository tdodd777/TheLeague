import Link from "next/link";
import { notFound } from "next/navigation";

import {
  AwardsPodium,
  BracketView,
  Card,
  DataTable,
  Kicker,
  ManagerAvatar,
  Pill,
  ScoreCell,
  SectionHeader,
  Sparkline,
  type DataTableColumn,
  type PodiumStep,
} from "@/components/ui";
import { LEAGUE_NAME } from "@/config/site";
import {
  getBiggestTradeOfSeason,
  getManagers,
  getSeasonPlacements,
  getStandings,
  getWeekBounds,
  getWeeklyPointsByRoster,
  listCachedSeasons,
  readLeague,
  readLosersBracket,
  readMatchups,
  readWinnersBracket,
  summarizeSides,
} from "@/lib/data";
import type { Manager, SeasonStanding } from "@/lib/types";

export const dynamic = "force-static";

interface PageProps {
  params: Promise<{ year: string }>;
}

export async function generateStaticParams() {
  const seasons = await listCachedSeasons();
  return seasons.map((year) => ({ year }));
}

export async function generateMetadata({ params }: PageProps) {
  const { year } = await params;
  return {
    title: `${year} Season · ${LEAGUE_NAME}`,
    description: `Final standings, brackets, and the awards podium from the ${year} season.`,
  };
}

interface StandingsRow extends SeasonStanding {
  /** Regular-season standings position, i.e. the playoff seed. */
  seed: number;
  /** True final placement from the playoff bracket. */
  finalPlace: number | null;
  /** Regular-season weekly points, matching the record and PF beside them. */
  weekly: number[];
  weeklyTotal: number;
}

export default async function HistoryYearPage({ params }: PageProps) {
  const { year } = await params;
  const seasons = await listCachedSeasons();
  if (!seasons.includes(year)) notFound();

  const [league, standings, placements, managers, weekly, biggest, winners, losers] =
    await Promise.all([
      readLeague(year),
      getStandings(year),
      getSeasonPlacements(year),
      getManagers(year),
      // Regular season: the PF column and W-L on this table stop at the
      // playoffs, so the sparkline next to them has to as well.
      getWeeklyPointsByRoster(year, { scope: "regular" }),
      getBiggestTradeOfSeason(year).catch(() => null),
      readWinnersBracket(year),
      readLosersBracket(year),
    ]);

  const hasGames = standings.some((s) => s.wins + s.losses + s.ties > 0);

  // Build podium.
  const podium: PodiumStep[] = [
    {
      place: 1,
      manager: pickManager(placements.champion, managers.byRosterId),
    },
    {
      place: 2,
      manager: pickManager(placements.runnerUp, managers.byRosterId),
    },
    {
      place: 3,
      manager: pickManager(placements.third, managers.byRosterId),
    },
  ];

  const rows: StandingsRow[] = standings.map((s, i) => {
    const wkly = weekly.get(s.rosterId) ?? [];
    return {
      ...s,
      seed: i + 1,
      finalPlace: placements.byRosterId.get(s.rosterId) ?? null,
      weekly: wkly,
      weeklyTotal: wkly.reduce((a, b) => a + b, 0),
    };
  });
  // Rank by where the bracket left everyone, not by regular-season seed. A team
  // the bracket never placed sorts after everyone it did.
  // Fall back to seed, not to 99. Mid-playoffs the bracket has not placed the
  // two finalists yet, and sorting unplaced teams last put the #1 and #2 seeds
  // below the team that finished 12th, on championship week of all weeks.
  rows.sort((a, b) => (a.finalPlace ?? a.seed) - (b.finalPlace ?? b.seed));

  // Top single-week scores. Record-book scope, so a week 16 title-game
  // explosion counts; each row is tagged with which phase it came from.
  const { lastWeek, regularSeasonEndWeek } = await getWeekBounds(year, "all");
  const weekScores: Array<{
    manager: Manager;
    week: number;
    points: number;
    isPlayoff: boolean;
  }> = [];
  for (let week = 1; week <= lastWeek; week += 1) {
    const matchups = await readMatchups(year, week);
    if (!matchups) continue;
    const isPlayoff = week > regularSeasonEndWeek;
    for (const m of matchups) {
      if (m.points === 0) continue;
      const manager = managers.byRosterId.get(m.roster_id);
      if (!manager) continue;
      weekScores.push({ manager, week, points: m.points, isPlayoff });
    }
  }
  const topWeeklyScores = [...weekScores]
    .sort((a, b) => b.points - a.points)
    .slice(0, 8);

  return (
    <main className="relative">
      <section className="relative overflow-hidden border-b border-border">
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 pt-10 pb-10 sm:pt-14 sm:pb-12">
          <SectionHeader
            kicker={`The ${year} Season · ${statusLabel(league.status)}`}
            title={`${year} Recap`}
            description={
              hasGames
                ? `${league.total_rosters}-team ${league.settings.type === 2 ? "dynasty" : "redraft"} league · ${rows.reduce((s, r) => s + r.wins + r.losses + r.ties, 0) / 2} games played.`
                : `Hasn't kicked off yet — ${league.total_rosters}-team ${league.settings.type === 2 ? "dynasty" : "redraft"} league.`
            }
            size="lg"
            actions={
              <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-1">
                {seasons.map((s) => (
                  <Link
                    key={s}
                    href={`/history/${s}`}
                    className={
                      s === year
                        ? "inline-flex min-h-11 lg:min-h-0 items-center px-3 lg:py-1 rounded-md bg-foreground/[0.06] text-foreground text-sm lg:text-xs font-medium tabular focus-hairline"
                        : "inline-flex min-h-11 lg:min-h-0 items-center px-3 lg:py-1 rounded-md text-foreground-muted hover:text-foreground hover:bg-foreground/[0.03] text-sm lg:text-xs tabular transition-colors focus-hairline"
                    }
                  >
                    {s}
                  </Link>
                ))}
              </div>
            }
          />
        </div>
      </section>

      {/* PODIUM */}
      {podium.some((p) => p.manager !== null) ? (
        <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-10 sm:mt-14">
          <Card variant="default" padding="lg">
            <div className="flex items-baseline justify-between mb-6">
              <Kicker>The Podium</Kicker>
              {biggest ? (
                <Link
                  href={`/transactions/trades/${biggest.trade.transactionId}`}
                  className="text-[11px] text-foreground-muted hover:text-accent transition-colors truncate max-w-[60%] text-right"
                >
                  Biggest trade: {biggest.trade.assetCount} assets →
                </Link>
              ) : null}
            </div>
            <AwardsPodium steps={podium} />
          </Card>
        </section>
      ) : null}

      {/* FINAL STANDINGS */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-10 sm:mt-14 flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-3">
          <Kicker>Final Standings</Kicker>
          <span className="text-[11px] text-foreground-subtle">
            Ordered by playoff finish · seed is the regular season position
          </span>
        </div>
        <FinalStandingsTable rows={rows} />
      </section>

      {/* BRACKETS */}
      {(winners && winners.length > 0) || (losers && losers.length > 0) ? (
        <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-10 sm:mt-14 flex flex-col gap-4">
          <Kicker>Playoff Brackets</Kicker>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {winners && winners.length > 0 ? (
              <Card variant="default" padding="lg">
                <BracketView
                  matchups={winners}
                  managers={managers.byRosterId}
                  title="Winners Bracket · Places 1–6"
                />
              </Card>
            ) : null}
            {losers && losers.length > 0 ? (
              <Card variant="default" padding="lg">
                <BracketView
                  matchups={losers}
                  managers={managers.byRosterId}
                  title="Losers Bracket · Places 7–12"
                  highlightChampionship={false}
                  losersBracket
                />
              </Card>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* WEEKLY SCORING LEADERBOARD */}
      {topWeeklyScores.length > 0 ? (
        <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-10 sm:mt-14 flex flex-col gap-4">
          <div className="flex items-baseline justify-between gap-3">
            <Kicker>Top Single-Week Scores</Kicker>
            <span className="text-[11px] text-foreground-subtle">
              Playoff weeks included
            </span>
          </div>
          <Card variant="default" padding="lg">
            <ol className="flex flex-col">
              {topWeeklyScores.map((s, i) => (
                <li
                  key={`${s.manager.userId}-${s.week}-${i}`}
                  className="flex items-center gap-3 py-2 border-b border-border/50 last:border-b-0"
                >
                  <span className="text-[10px] tabular text-foreground-subtle w-5 text-right">
                    {i + 1}
                  </span>
                  <ManagerAvatar manager={s.manager} size={26} ring="subtle" />
                  <Link
                    href={`/managers/${s.manager.username}`}
                    className="flex-1 text-sm text-foreground hover:text-accent transition-colors truncate"
                  >
                    {s.manager.displayName}
                  </Link>
                  <span className="text-[11px] tabular text-foreground-subtle whitespace-nowrap">
                    wk {s.week}
                    {s.isPlayoff ? " · playoffs" : ""}
                  </span>
                  <ScoreCell value={s.points} precision={2} />
                </li>
              ))}
            </ol>
          </Card>
        </section>
      ) : null}

      {/* BIGGEST TRADE */}
      {biggest ? (
        <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-10 sm:mt-14 flex flex-col gap-4">
          <Kicker>Biggest Trade</Kicker>
          <Link
            href={`/transactions/trades/${biggest.trade.transactionId}`}
            className="block"
          >
            <Card variant="interactive" padding="lg">
              <div className="flex items-baseline justify-between mb-3">
                <span className="text-sm text-foreground-muted tabular">
                  {new Date(biggest.trade.statusUpdated).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
                <Pill tone="accent" size="sm">
                  {biggest.trade.assetCount} assets
                </Pill>
              </div>
              <p className="text-sm text-foreground tabular">
                {summarizeSides(biggest.trade)}
              </p>
              <span className="block text-[11px] text-foreground-subtle mt-3">
                See historical fairness using value snapshots →
              </span>
            </Card>
          </Link>
        </section>
      ) : null}
    </main>
  );
}

function pickManager(
  rosterId: number | null,
  byRosterId: Map<number, Manager>,
): Manager | null {
  if (rosterId === null) return null;
  return byRosterId.get(rosterId) ?? null;
}

function statusLabel(status: string): string {
  switch (status) {
    case "pre_draft":
      return "Pre-Draft";
    case "drafting":
      return "Drafting";
    case "in_season":
      return "In Season";
    case "complete":
      return "Complete";
    default:
      return status;
  }
}

function FinalStandingsTable({ rows }: { rows: StandingsRow[] }) {
  const columns: Array<DataTableColumn<StandingsRow>> = [
    {
      key: "place",
      header: "Finish",
      width: "64px",
      cell: (r) =>
        r.finalPlace !== null ? (
          <Pill
            tone={r.finalPlace === 1 ? "accent" : r.finalPlace <= 3 ? "secondary" : "neutral"}
            size="sm"
            className="min-w-[28px] justify-center"
          >
            {r.finalPlace}
          </Pill>
        ) : (
          <Pill
            tone="neutral"
            size="sm"
            className="min-w-[28px] justify-center"
          >
            —
          </Pill>
        ),
    },
    {
      key: "seed",
      header: "Seed",
      width: "56px",
      align: "right",
      cell: (r) => (
        <span className="text-xs tabular text-foreground-subtle">{r.seed}</span>
      ),
    },
    {
      key: "manager",
      header: "Manager",
      cell: (r) => (
        <Link
          href={`/managers/${r.manager.username}`}
          className="flex items-center gap-3 group"
        >
          <ManagerAvatar manager={r.manager} size={28} ring="subtle" />
          <span className="flex flex-col min-w-0">
            <span className="text-sm font-medium text-foreground group-hover:text-accent transition-colors truncate">
              {r.manager.displayName}
            </span>
            <span className="text-xs text-foreground-subtle truncate">
              @{r.manager.username}
            </span>
          </span>
        </Link>
      ),
    },
    {
      key: "record",
      header: "Record",
      align: "right",
      cell: (r) => (
        <Pill
          tone={r.wins > r.losses ? "positive" : r.wins < r.losses ? "negative" : "neutral"}
          size="sm"
        >
          {r.wins}-{r.losses}
          {r.ties ? `-${r.ties}` : ""}
        </Pill>
      ),
    },
    {
      key: "weekly",
      header: "Weekly",
      hideBelow: "md",
      width: "140px",
      cell: (r) =>
        r.weekly.length >= 2 ? (
          <Sparkline
            values={r.weekly}
            width={120}
            height={20}
            stroke="var(--accent-primary)"
            className="text-accent"
          />
        ) : null,
      align: "right",
    },
    {
      key: "pf",
      header: "PF",
      align: "right",
      cell: (r) => <ScoreCell value={r.pf} precision={2} />,
    },
    {
      key: "pa",
      header: "PA",
      align: "right",
      hideBelow: "sm",
      cell: (r) => <ScoreCell value={r.pa} precision={2} emphasis="muted" />,
    },
    {
      key: "ppts",
      header: "Potential",
      align: "right",
      hideBelow: "lg",
      cell: (r) => <ScoreCell value={r.ppts} precision={2} emphasis="muted" />,
    },
  ];
  return (
    <>
      {/* Card stack is canonical through `lg` (README §8); DataTable is desktop-only. */}
      <ul className="lg:hidden border-y border-rule">
        {rows.map((r) => (
          <li
            key={r.rosterId}
            className="flex items-center gap-3 border-b border-rule last:border-b-0 py-2.5"
          >
            <span
              className="font-display italic text-[17px] text-foreground-subtle w-7 shrink-0 tabular"
              aria-label={
                r.finalPlace !== null
                  ? `Finished ${r.finalPlace}`
                  : `Seed ${r.seed}, no playoff finish recorded`
              }
            >
              {r.finalPlace ?? "—"}
            </span>
            <ManagerAvatar manager={r.manager} size={30} ring="subtle" />
            <span className="flex-1 min-w-0 flex flex-col">
              <span className="text-sm text-foreground">
                {r.manager.displayName}
              </span>
              <span className="text-[11px] tabular text-foreground-subtle">
                {r.wins}-{r.losses}
                {r.ties ? `-${r.ties}` : ""} · {r.pf.toFixed(1)} PF · seed #
                {r.seed}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <div className="hidden lg:block">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.rosterId}
          caption="Final standings"
        />
      </div>
    </>
  );
}
