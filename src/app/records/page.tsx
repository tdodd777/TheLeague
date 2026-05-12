import Link from "next/link";

import {
  Card,
  EmptyState,
  ExpandableRow,
  Kicker,
  ManagerAvatar,
  Pill,
  ScoreCell,
  SectionHeader,
  StatTile,
} from "@/components/ui";
import { MatchupReceipt } from "@/components/ui/MatchupReceipt";
import { LEAGUE_NAME } from "@/config/site";
import {
  getRecords,
  type MatchupMarginRow,
  type SeasonRecords,
  type WeekScoreRow,
} from "@/lib/data";

export const dynamic = "force-static";

export const metadata = {
  title: `All-Time Records · ${LEAGUE_NAME}`,
  description:
    "Single-week, single-season, and career records across the league's history.",
};

export default async function RecordsPage() {
  const { allTime, perSeason } = await getRecords();
  const seasonsCount = allTime.seasonsCounted.length;

  if (seasonsCount === 0) {
    return (
      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-16">
        <EmptyState
          title="The record book is blank"
          description="Highest weeks, biggest blowouts, and lifetime rankings appear once the league has played its first season."
        />
      </main>
    );
  }

  const topWeek = allTime.topWeeks[0];
  const biggestBlowout = allTime.biggestBlowouts[0];
  const closest = allTime.closestGames[0];
  const topSeason = allTime.topSeasons[0];

  return (
    <main className="relative">
      <section className="relative overflow-hidden border-b border-border">
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 pt-10 pb-10 sm:pt-14 sm:pb-12">
          <SectionHeader
            kicker={`${seasonsCount} ${seasonsCount === 1 ? "season" : "seasons"} on the books`}
            title="All-Time Records"
            description="Every weekly high, every blowout, every receipt across the league's history."
            size="lg"
          />
        </div>
      </section>

      {/* HIGHLIGHT REEL */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {topWeek ? (
          <StatTile
            label="Highest week"
            value={topWeek.points}
            precision={2}
            accent="primary"
            subValue={`${topWeek.manager.username} · ${topWeek.season} wk ${topWeek.week}`}
          />
        ) : null}
        {biggestBlowout ? (
          <StatTile
            label="Biggest blowout"
            value={biggestBlowout.margin}
            precision={2}
            accent="primary"
            subValue={`${biggestBlowout.winner.username} over ${biggestBlowout.loser.username} · ${biggestBlowout.season} wk ${biggestBlowout.week}`}
          />
        ) : null}
        {closest ? (
          <StatTile
            label="Closest game"
            value={closest.margin}
            precision={2}
            accent="secondary"
            suffix=" pts"
            subValue={`${closest.winner.username} edged ${closest.loser.username} · ${closest.season} wk ${closest.week}`}
          />
        ) : null}
        {topSeason ? (
          <StatTile
            label="Highest season PF"
            value={topSeason.pf}
            precision={0}
            accent="secondary"
            subValue={`${topSeason.manager.username} · ${topSeason.season} (${topSeason.record})`}
          />
        ) : null}
      </section>

      {/* STREAKS + CHAMPIONSHIPS */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-10 sm:mt-14 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card variant="default" padding="lg" className="lg:col-span-2">
          <Kicker>Streaks</Kicker>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-4">
            <div className="flex flex-col gap-2">
              <span className="text-[10px] uppercase tracking-[0.18em] text-foreground-subtle">
                Longest Win Streak
              </span>
              {allTime.longestWinStreak ? (
                <>
                  <Link
                    href={`/managers/${allTime.longestWinStreak.manager.username}`}
                    className="flex items-center gap-3 group"
                  >
                    <ManagerAvatar
                      manager={allTime.longestWinStreak.manager}
                      size={36}
                      ring="subtle"
                    />
                    <span className="flex flex-col min-w-0">
                      <span className="font-display text-3xl text-foreground leading-none tabular">
                        {allTime.longestWinStreak.length}{" "}
                        <span className="text-foreground-subtle text-base">
                          straight
                        </span>
                      </span>
                      <span className="text-xs text-foreground-muted truncate">
                        {allTime.longestWinStreak.manager.displayName} · @
                        {allTime.longestWinStreak.manager.username}
                      </span>
                      <span className="text-[11px] text-foreground-subtle tabular">
                        {allTime.longestWinStreak.startSeason} wk{" "}
                        {allTime.longestWinStreak.startWeek} →{" "}
                        {allTime.longestWinStreak.endSeason} wk{" "}
                        {allTime.longestWinStreak.endWeek}
                      </span>
                    </span>
                  </Link>
                </>
              ) : (
                <span className="text-sm text-foreground-subtle">—</span>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-[10px] uppercase tracking-[0.18em] text-foreground-subtle">
                Longest Loss Streak
              </span>
              {allTime.longestLossStreak ? (
                <Link
                  href={`/managers/${allTime.longestLossStreak.manager.username}`}
                  className="flex items-center gap-3 group"
                >
                  <ManagerAvatar
                    manager={allTime.longestLossStreak.manager}
                    size={36}
                    ring="subtle"
                  />
                  <span className="flex flex-col min-w-0">
                    <span className="font-display text-3xl text-foreground leading-none tabular">
                      {allTime.longestLossStreak.length}{" "}
                      <span className="text-foreground-subtle text-base">
                        straight
                      </span>
                    </span>
                    <span className="text-xs text-foreground-muted truncate">
                      {allTime.longestLossStreak.manager.displayName} · @
                      {allTime.longestLossStreak.manager.username}
                    </span>
                    <span className="text-[11px] text-foreground-subtle tabular">
                      {allTime.longestLossStreak.startSeason} wk{" "}
                      {allTime.longestLossStreak.startWeek} →{" "}
                      {allTime.longestLossStreak.endSeason} wk{" "}
                      {allTime.longestLossStreak.endWeek}
                    </span>
                  </span>
                </Link>
              ) : (
                <span className="text-sm text-foreground-subtle">—</span>
              )}
            </div>
          </div>
        </Card>

        <Card variant="default" padding="lg">
          <Kicker>Hardware</Kicker>
          <div className="mt-4 flex flex-col gap-2.5">
            {allTime.champions.length === 0 ? (
              <span className="text-sm text-foreground-subtle">
                No champions on the board yet.
              </span>
            ) : (
              allTime.champions.map((c) => (
                <Link
                  key={c.manager.userId}
                  href={`/managers/${c.manager.username}`}
                  className="flex items-center gap-2.5 group"
                >
                  <ManagerAvatar manager={c.manager} size={28} ring="subtle" />
                  <span className="flex-1 text-sm text-foreground group-hover:text-accent transition-colors truncate">
                    {c.manager.displayName}
                  </span>
                  <span className="text-xs tabular text-foreground-muted">
                    {c.titles.length}× · {c.titles.join(", ")}
                  </span>
                </Link>
              ))
            )}
          </div>
        </Card>
      </section>

      {/* WEEK LEADERBOARDS */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-10 sm:mt-14 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card variant="default" padding="lg">
          <div className="flex items-baseline justify-between mb-4">
            <Kicker>Top 10 Weeks</Kicker>
            <Pill tone="positive" size="sm">
              high score
            </Pill>
          </div>
          <WeekList rows={allTime.topWeeks} variant="top" />
        </Card>

        <Card variant="default" padding="lg">
          <div className="flex items-baseline justify-between mb-4">
            <Kicker>Bottom 10 Weeks</Kicker>
            <Pill tone="negative" size="sm">
              cooked
            </Pill>
          </div>
          <WeekList rows={allTime.bottomWeeks} variant="bottom" />
        </Card>
      </section>

      {/* MARGIN LEADERBOARDS */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-10 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card variant="default" padding="lg">
          <div className="flex items-baseline justify-between mb-4">
            <Kicker>Biggest Blowouts</Kicker>
            <Pill tone="accent" size="sm">
              by margin
            </Pill>
          </div>
          <MarginList rows={allTime.biggestBlowouts} />
        </Card>

        <Card variant="default" padding="lg">
          <div className="flex items-baseline justify-between mb-4">
            <Kicker>Closest Games</Kicker>
            <Pill tone="secondary" size="sm">
              one-score
            </Pill>
          </div>
          <MarginList rows={allTime.closestGames} />
        </Card>
      </section>

      {/* SEASON LEADERBOARDS */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-10 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card variant="default" padding="lg">
          <div className="flex items-baseline justify-between mb-4">
            <Kicker>Highest Season PF</Kicker>
            <Pill tone="positive" size="sm">
              juggernaut
            </Pill>
          </div>
          <ol className="flex flex-col">
            {allTime.topSeasons.map((s, i) => (
              <li
                key={`${s.season}-${s.manager.userId}`}
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
                <span className="text-[11px] tabular text-foreground-subtle">
                  {s.season} · {s.record}
                </span>
                <ScoreCell value={s.pf} precision={2} />
              </li>
            ))}
          </ol>
        </Card>

        <Card variant="default" padding="lg">
          <div className="flex items-baseline justify-between mb-4">
            <Kicker>Lowest Season PF</Kicker>
            <Pill tone="negative" size="sm">
              forgotten lineup
            </Pill>
          </div>
          <ol className="flex flex-col">
            {allTime.bottomSeasons.map((s, i) => (
              <li
                key={`${s.season}-${s.manager.userId}`}
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
                <span className="text-[11px] tabular text-foreground-subtle">
                  {s.season} · {s.record}
                </span>
                <ScoreCell value={s.pf} precision={2} emphasis="muted" />
              </li>
            ))}
          </ol>
        </Card>
      </section>

      {/* PER-SEASON BREAKDOWN */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-12 sm:mt-16 flex flex-col gap-5">
        <SectionHeader
          kicker="Year by Year"
          title="Per-Season Records"
          description="The week-five high, the wk-12 cooking, the closest game of the year. Every season."
          size="md"
        />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {perSeason.map((s) => (
            <SeasonRecordCard key={s.season} record={s} />
          ))}
        </div>
      </section>
    </main>
  );
}

function WeekList({
  rows,
  variant,
}: {
  rows: WeekScoreRow[];
  variant: "top" | "bottom";
}) {
  if (rows.length === 0) {
    return (
      <span className="text-sm text-foreground-subtle">
        No data for this leaderboard yet.
      </span>
    );
  }
  return (
    <ol className="flex flex-col">
      {rows.map((r, i) => (
        <li
          key={`${r.season}-${r.week}-${r.manager.userId}-${i}`}
          className="py-2 border-b border-border/50 last:border-b-0"
        >
          <ExpandableRow
            label={`Show matchup for ${r.manager.username} ${r.season} week ${r.week}`}
            trigger={
              <div className="flex items-center gap-3">
                <span className="text-[10px] tabular text-foreground-subtle w-5 text-right">
                  {i + 1}
                </span>
                <ManagerAvatar manager={r.manager} size={26} ring="subtle" />
                <span className="flex-1 text-sm text-foreground truncate">
                  {r.manager.displayName}
                </span>
                <span className="text-[11px] tabular text-foreground-subtle whitespace-nowrap">
                  {r.season} wk {r.week}
                </span>
                <ScoreCell
                  value={r.points}
                  precision={2}
                  emphasis={variant === "top" ? "primary" : "muted"}
                />
              </div>
            }
          >
            <MatchupReceipt
              season={r.season}
              week={r.week}
              userId={r.manager.userId}
            />
          </ExpandableRow>
        </li>
      ))}
    </ol>
  );
}

function MarginList({ rows }: { rows: MatchupMarginRow[] }) {
  if (rows.length === 0) {
    return (
      <span className="text-sm text-foreground-subtle">
        No matchups recorded yet.
      </span>
    );
  }
  return (
    <ol className="flex flex-col">
      {rows.map((r, i) => (
        <li
          key={`${r.season}-${r.week}-${r.winner.userId}-${i}`}
          className="py-2 border-b border-border/50 last:border-b-0"
        >
          <ExpandableRow
            label={`Show matchup ${r.winner.username} vs ${r.loser.username} ${r.season} week ${r.week}`}
            trigger={
              <div className="flex items-center gap-3">
                <span className="text-[10px] tabular text-foreground-subtle w-5 text-right">
                  {i + 1}
                </span>
                <span className="flex flex-col min-w-0 flex-1">
                  <span className="text-sm tabular text-foreground truncate">
                    {r.winner.username}{" "}
                    <span className="text-foreground-subtle">def.</span>{" "}
                    {r.loser.username}
                  </span>
                  <span className="text-[11px] tabular text-foreground-subtle">
                    {r.season} wk {r.week} · {r.winnerPoints.toFixed(2)} –{" "}
                    {r.loserPoints.toFixed(2)}
                  </span>
                </span>
                <ScoreCell value={r.margin} precision={2} />
              </div>
            }
          >
            <MatchupReceipt
              season={r.season}
              week={r.week}
              userId={r.winner.userId}
            />
          </ExpandableRow>
        </li>
      ))}
    </ol>
  );
}

function SeasonRecordCard({ record }: { record: SeasonRecords }) {
  const top = record.topWeeks[0];
  const bot = record.bottomWeeks[0];
  const blow = record.biggestBlowouts[0];
  const close = record.closestGames[0];
  return (
    <Card variant="default" padding="md">
      <div className="flex items-baseline justify-between mb-3">
        <Kicker>{record.season}</Kicker>
        <Link
          href={`/history/${record.season}`}
          className="text-[11px] text-foreground-muted hover:text-accent transition-colors"
        >
          full recap →
        </Link>
      </div>
      <ul className="grid grid-cols-2 gap-3 text-xs">
        {top ? (
          <li className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-[0.18em] text-foreground-subtle">
              Top wk
            </span>
            <span className="font-display text-2xl tabular text-foreground leading-none">
              {top.points.toFixed(2)}
            </span>
            <span className="text-[11px] text-foreground-muted truncate">
              @{top.manager.username} · wk {top.week}
            </span>
          </li>
        ) : null}
        {bot ? (
          <li className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-[0.18em] text-foreground-subtle">
              Low wk
            </span>
            <span className="font-display text-2xl tabular text-foreground leading-none">
              {bot.points.toFixed(2)}
            </span>
            <span className="text-[11px] text-foreground-muted truncate">
              @{bot.manager.username} · wk {bot.week}
            </span>
          </li>
        ) : null}
        {blow ? (
          <li className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-[0.18em] text-foreground-subtle">
              Blowout
            </span>
            <span className="font-display text-2xl tabular text-foreground leading-none">
              {blow.margin.toFixed(2)}
            </span>
            <span className="text-[11px] text-foreground-muted truncate">
              @{blow.winner.username} over @{blow.loser.username}
            </span>
          </li>
        ) : null}
        {close ? (
          <li className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-[0.18em] text-foreground-subtle">
              Nailbiter
            </span>
            <span className="font-display text-2xl tabular text-foreground leading-none">
              {close.margin.toFixed(2)}
            </span>
            <span className="text-[11px] text-foreground-muted truncate">
              wk {close.week} · @{close.winner.username} survived
            </span>
          </li>
        ) : null}
      </ul>
    </Card>
  );
}
