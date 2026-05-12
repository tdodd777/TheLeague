import Link from "next/link";

import {
  DataTable,
  EmptyState,
  ManagerAvatar,
  Pill,
  ScoreCell,
  SectionHeader,
  Sparkline,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import type { DataTableColumn } from "@/components/ui";
import {
  getCurrentLeague,
  getStandings,
  getWeeklyPointsByRoster,
  listCachedSeasons,
} from "@/lib/data";
import type { SeasonStanding } from "@/lib/types";

interface StandingsRow extends SeasonStanding {
  rank: number;
  weekly: number[];
}

interface PageProps {
  searchParams: Promise<{ season?: string }>;
}

export default async function StandingsPage({ searchParams }: PageProps) {
  const { season: requested } = await searchParams;
  const { season: currentSeason, league } = await getCurrentLeague();
  const seasons = await listCachedSeasons();

  const currentHasResults =
    league.status === "in_season" || league.status === "complete";
  const fallbackSeason = currentHasResults
    ? null
    : (seasons.find((s) => s !== currentSeason) ?? null);

  const renderedSeason =
    requested && seasons.includes(requested)
      ? requested
      : currentHasResults
        ? currentSeason
        : (fallbackSeason ?? currentSeason);

  const standings = await getStandings(renderedSeason);
  const weekly = await getWeeklyPointsByRoster(renderedSeason);
  const rows: StandingsRow[] = standings.map((s, i) => ({
    ...s,
    rank: i + 1,
    weekly: weekly.get(s.rosterId) ?? [],
  }));

  const playoffSpots = league.settings.playoff_teams || 6;
  const totalGames = standings[0]
    ? standings[0].wins + standings[0].losses + standings[0].ties
    : 0;
  const isFallback = !currentHasResults && renderedSeason !== currentSeason;

  return (
    <main className="relative">
      <section className="relative overflow-hidden border-b border-border">
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 pt-10 pb-10 sm:pt-14 sm:pb-12">
          <SectionHeader
            kicker={`${renderedSeason} ${currentHasResults && renderedSeason === currentSeason ? "Standings" : "Final"}`}
            title="Standings"
            description={
              isFallback
                ? `${currentSeason} hasn't kicked off — showing the final ${renderedSeason} table.`
                : `${totalGames} games played · top ${playoffSpots} make the playoffs.`
            }
            size="lg"
            actions={
              <SeasonPills seasons={seasons} active={renderedSeason} />
            }
          />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-8">
        {rows.length === 0 ? (
          <EmptyState
            title="The season hasn't kicked off"
            description="Standings populate once Week 1 is on the books. Check back when the games start."
          />
        ) : (
          <>
            {/* Card stack — canonical view for phone + tablet (per ARCHITECTURE.md §7). */}
            <div className="lg:hidden border-y border-rule">
              {rows.map((r) => (
                <StandingsMobileCard
                  key={r.rosterId}
                  row={r}
                  playoffSpots={playoffSpots}
                />
              ))}
            </div>
            {/* Desktop dense table. */}
            <div className="hidden lg:block">
              <StandingsDesktopTable rows={rows} playoffSpots={playoffSpots} />
            </div>
          </>
        )}
      </section>
    </main>
  );
}

function SeasonPills({
  seasons,
  active,
}: {
  seasons: string[];
  active: string;
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-1">
      {seasons.map((s) => (
        <Link
          key={s}
          href={s === active ? "/standings" : `/standings?season=${s}`}
          className={
            s === active
              ? "px-3 py-1 rounded-md bg-foreground/[0.06] text-foreground text-xs font-medium tabular"
              : "px-3 py-1 rounded-md text-foreground-muted hover:text-foreground hover:bg-foreground/[0.03] text-xs tabular transition-colors"
          }
        >
          {s}
        </Link>
      ))}
    </div>
  );
}

function rankTone(rank: number, playoffSpots: number, total: number) {
  if (rank <= playoffSpots) return "accent";
  if (rank === total) return "negative";
  return "neutral";
}

function rankAccent(
  rank: number,
  playoffSpots: number,
  total: number,
): "positive" | "negative" | null {
  if (rank <= playoffSpots) return "positive";
  if (rank === total) return "negative";
  return null;
}

function StandingsDesktopTable({
  rows,
  playoffSpots,
}: {
  rows: StandingsRow[];
  playoffSpots: number;
}) {
  const total = rows.length;
  const columns: Array<DataTableColumn<StandingsRow>> = [
    {
      key: "rank",
      header: "#",
      width: "52px",
      cell: (r) => {
        const tone = rankTone(r.rank, playoffSpots, total);
        return (
          <span
            aria-label={`Rank ${r.rank}`}
            className={cn(
              "font-display text-2xl tabular leading-none",
              tone === "accent"
                ? "text-accent"
                : tone === "negative"
                  ? "text-foreground-subtle"
                  : "text-foreground-muted",
            )}
          >
            {r.rank.toString().padStart(2, "0")}
          </span>
        );
      },
    },
    {
      key: "manager",
      header: "Manager",
      cell: (r) => (
        <Link
          href={`/managers/${r.manager.username}`}
          className="flex items-center gap-3 group"
        >
          <ManagerAvatar manager={r.manager} size={32} ring="subtle" />
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
      header: "Weekly PF",
      hideBelow: "md",
      cell: (r) =>
        r.weekly.length >= 2 ? (
          <div className="flex items-center gap-2 justify-end">
            <Sparkline
              values={r.weekly}
              width={96}
              height={20}
              tintTrend
              fillGradient
            />
            <span className="text-xs text-foreground-muted tabular tabular w-12 text-right">
              {(r.weekly.reduce((a, b) => a + b, 0) / r.weekly.length).toFixed(0)}
              <span className="text-[10px] text-foreground-subtle">/g</span>
            </span>
          </div>
        ) : null,
      align: "right",
      width: "180px",
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
    {
      key: "streak",
      header: "Streak",
      align: "right",
      hideBelow: "md",
      cell: (r) => (
        <span className="text-xs tabular text-foreground-muted">
          {r.streak ?? "—"}
        </span>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.rosterId}
      rowAccent={(r) => rankAccent(r.rank, playoffSpots, total)}
      caption="Season standings"
    />
  );
}

function StandingsMobileCard({
  row,
  playoffSpots,
}: {
  row: StandingsRow;
  playoffSpots: number;
}) {
  const accent = rankAccent(row.rank, playoffSpots, 12);
  const tone = rankTone(row.rank, playoffSpots, 12);
  return (
    <Link
      href={`/managers/${row.manager.username}`}
      className={cn(
        "block py-3 px-3 hover:bg-row-hover transition-colors border-b border-rule last:border-b-0",
        accent === "positive"
          ? "shadow-[inset_1px_0_0_var(--row-accent-positive)]"
          : accent === "negative"
            ? "shadow-[inset_1px_0_0_var(--row-accent-negative)]"
            : "",
      )}
    >
      <div className="flex items-center gap-3">
        <span
          aria-label={`Rank ${row.rank}`}
          className={cn(
            "font-display text-3xl tabular leading-none w-10 shrink-0 text-center",
            tone === "accent"
              ? "text-accent"
              : tone === "negative"
                ? "text-foreground-subtle"
                : "text-foreground-muted",
          )}
        >
          {row.rank.toString().padStart(2, "0")}
        </span>
        <ManagerAvatar manager={row.manager} size={36} ring="subtle" />
        <div className="flex flex-col min-w-0 flex-1">
          <span className="font-display text-xl text-foreground leading-tight truncate">
            {row.manager.displayName}
          </span>
          <span className="text-[11px] text-foreground-subtle truncate tabular">
            {row.wins}-{row.losses}
            {row.ties ? `-${row.ties}` : ""} · {row.pf.toFixed(1)} PF
            {row.streak ? ` · ${row.streak}` : ""}
          </span>
        </div>
        {row.weekly.length >= 2 ? (
          <Sparkline
            values={row.weekly}
            width={56}
            height={20}
            tintTrend
            fillGradient
            className="shrink-0"
            endDot={false}
          />
        ) : null}
      </div>
    </Link>
  );
}
