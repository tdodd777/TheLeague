import Link from "next/link";
import { notFound } from "next/navigation";

import { positionColor } from "@/components/rankings/palette";
import {
  Card,
  Kicker,
  ManagerAvatar,
  Pill,
  PlayerImage,
  ScoreCell,
  SectionHeader,
} from "@/components/ui";
import { LEAGUE_NAME } from "@/config/site";
import {
  getManagers,
  getMatchupLineups,
  listCachedMatchupWeeks,
  readLeague,
  readMatchups,
} from "@/lib/data";
import type { RosterLineup } from "@/lib/data";
import type { SleeperMatchup } from "@/lib/sleeper";
import type { Manager } from "@/lib/types";

import { WeekPillsScroller } from "./WeekPillsScroller";

export const dynamic = "force-static";

interface PageProps {
  params: Promise<{ season: string; week: string }>;
}

export async function generateStaticParams(): Promise<
  Array<{ season: string; week: string }>
> {
  const all = await listCachedMatchupWeeks();
  return all.flatMap(({ season, weeks }) =>
    weeks.map((w) => ({ season, week: String(w).padStart(2, "0") })),
  );
}

export async function generateMetadata({ params }: PageProps) {
  const { season, week } = await params;
  const w = Number.parseInt(week, 10);
  return {
    title: `Week ${w} · ${season} · ${LEAGUE_NAME}`,
    description: `Week ${w} scoreboard for the ${season} season.`,
  };
}

interface PairView {
  matchupId: number;
  a: { matchup: SleeperMatchup; manager: Manager; lineup: RosterLineup | null };
  b: { matchup: SleeperMatchup; manager: Manager; lineup: RosterLineup | null };
  combined: number;
  margin: number;
}

export default async function MatchupWeekPage({ params }: PageProps) {
  const { season, week: weekStr } = await params;
  const week = Number.parseInt(weekStr, 10);
  if (!Number.isFinite(week) || week < 1) notFound();

  const matchups = await readMatchups(season, week);
  if (!matchups || matchups.length === 0) notFound();

  const [managers, league, allWeeks] = await Promise.all([
    getManagers(season),
    readLeague(season),
    listCachedMatchupWeeks(),
  ]);
  const seasonWeeks = allWeeks.find((s) => s.season === season)?.weeks ?? [];
  const playoffStart = league.settings.playoff_week_start || 15;
  const isPlayoff = week >= playoffStart;

  // Group raw matchups by matchup_id (each pair has two entries).
  const byId = new Map<number, SleeperMatchup[]>();
  for (const m of matchups) {
    const arr = byId.get(m.matchup_id) ?? [];
    arr.push(m);
    byId.set(m.matchup_id, arr);
  }

  const pairs: PairView[] = [];
  for (const [matchupId, list] of byId) {
    if (list.length !== 2) continue;
    const [ra, rb] = list as [SleeperMatchup, SleeperMatchup];
    const ma = managers.byRosterId.get(ra.roster_id);
    const mb = managers.byRosterId.get(rb.roster_id);
    if (!ma || !mb) continue;
    // Higher score on the left for visual consistency.
    const [aMatch, bMatch, aMgr, bMgr] =
      ra.points >= rb.points ? [ra, rb, ma, mb] : [rb, ra, mb, ma];
    const lineups = await getMatchupLineups(
      season,
      week,
      aMatch.roster_id,
      bMatch.roster_id,
    );
    pairs.push({
      matchupId,
      a: { matchup: aMatch, manager: aMgr, lineup: lineups?.a ?? null },
      b: { matchup: bMatch, manager: bMgr, lineup: lineups?.b ?? null },
      combined: aMatch.points + bMatch.points,
      margin: aMatch.points - bMatch.points,
    });
  }

  // Sort: closest games first, then highest combined score.
  pairs.sort((p1, p2) => {
    if (p1.margin !== p2.margin) return p1.margin - p2.margin;
    return p2.combined - p1.combined;
  });

  const totalPoints = pairs.reduce((s, p) => s + p.combined, 0);
  const avgScore = pairs.length > 0 ? totalPoints / (pairs.length * 2) : 0;
  const closest = pairs[0] ?? null;
  const highest = [...pairs].sort((p1, p2) => p2.combined - p1.combined)[0] ?? null;

  return (
    <main className="relative">
      <section className="relative overflow-hidden border-b border-border">
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 pt-10 pb-10 sm:pt-14 sm:pb-12">
          <div className="flex items-center gap-4 mb-4">
            <Link
              href="/matchups"
              className="inline-flex min-h-11 lg:min-h-0 items-center text-xs uppercase tracking-[0.18em] text-foreground-subtle hover:text-foreground transition-colors focus-hairline"
            >
              ← all matchups
            </Link>
          </div>
          <SectionHeader
            kicker={`${season} · Week ${week}${isPlayoff ? " · Playoffs" : ""}`}
            title="Scoreboard"
            description={
              pairs.length > 0
                ? `${pairs.length} games · league avg ${avgScore.toFixed(1)} per team.`
                : "No matchups recorded for this week."
            }
            size="lg"
            actions={<WeekPills season={season} weeks={seasonWeeks} active={week} />}
          />
        </div>
      </section>

      {(closest || highest) && pairs.length > 1 ? (
        <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {closest ? (
            <Card variant="default" padding="md">
              <Kicker>Closest game</Kicker>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-display text-3xl text-foreground tabular leading-none">
                  {closest.a.matchup.points.toFixed(1)}—{closest.b.matchup.points.toFixed(1)}
                </span>
                <span className="text-xs text-foreground-subtle tabular">
                  margin {closest.margin.toFixed(2)}
                </span>
              </div>
              <span className="text-xs text-foreground-subtle mt-1 block">
                {closest.a.manager.displayName} vs {closest.b.manager.displayName}
              </span>
            </Card>
          ) : null}
          {highest ? (
            <Card variant="default" padding="md">
              <Kicker>Highest scoring</Kicker>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-display text-3xl text-foreground tabular leading-none">
                  {highest.combined.toFixed(1)}
                </span>
                <span className="text-xs text-foreground-subtle tabular">
                  combined points
                </span>
              </div>
              <span className="text-xs text-foreground-subtle mt-1 block">
                {highest.a.manager.displayName} {highest.a.matchup.points.toFixed(1)} ·{" "}
                {highest.b.manager.displayName} {highest.b.matchup.points.toFixed(1)}
              </span>
            </Card>
          ) : null}
        </section>
      ) : null}

      <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-8 sm:mt-10 grid grid-cols-1 lg:grid-cols-2 gap-3">
        {pairs.map((p) => (
          <PairCard key={p.matchupId} pair={p} />
        ))}
      </section>
    </main>
  );
}

function WeekPills({
  season,
  weeks,
  active,
}: {
  season: string;
  weeks: number[];
  active: number;
}) {
  if (weeks.length === 0) return null;
  return (
    <WeekPillsScroller>
      {weeks.map((w) => {
        const ww = String(w).padStart(2, "0");
        const isActive = w === active;
        return (
          <Link
            key={w}
            href={`/matchups/${season}/${ww}`}
            aria-current={isActive ? "page" : undefined}
            className={
              isActive
                ? "inline-flex min-h-11 min-w-11 items-center justify-center px-2.5 rounded-md bg-foreground/[0.06] font-display italic text-[15px] text-foreground shrink-0 focus-hairline"
                : "inline-flex min-h-11 min-w-11 items-center justify-center px-2.5 rounded-md text-foreground-muted hover:text-foreground hover:bg-foreground/[0.03] text-[13px] tabular transition-colors shrink-0 focus-hairline"
            }
          >
            {w}
          </Link>
        );
      })}
    </WeekPillsScroller>
  );
}

function topStarter(lineup: RosterLineup | null) {
  if (!lineup) return null;
  return [...lineup.starters].sort((a, b) => b.points - a.points)[0] ?? null;
}

function PairCard({ pair }: { pair: PairView }) {
  const aWon = pair.a.matchup.points > pair.b.matchup.points;
  const tied = pair.a.matchup.points === pair.b.matchup.points;
  const aTop = topStarter(pair.a.lineup);
  const bTop = topStarter(pair.b.lineup);
  const h2hHref = `/h2h/${pair.a.manager.username}/${pair.b.manager.username}`;

  return (
    <Link
      href={h2hHref}
      className="group rounded-xl border border-border bg-surface hover:border-border-strong hover:bg-foreground/[0.02] transition-colors overflow-hidden"
    >
      {/*
        One markup tree, two layouts — never two trees. A duplicated card ships
        a second copy of both managers and both top scorers, and PlayerImage is
        a client component, so each hidden copy is another instance to hydrate.

        From `lg` the three inner divs are the grid rows they have always been —
        manager / score / top scorer, mirrored around the middle column, with
        their own padding, rules and column tracks untouched.

        Below `lg` those rows collapse to `display: contents`, so their children
        become items of the flat two-column stack declared here: one full-width
        block per team (manager + score on a line, that team's top scorer under
        it), split by the vs band. The mirrored grid leaves only ~145px a side
        at 390px, which clipped team names and every top-player name.
      */}
      <div className="grid grid-cols-[1fr_auto] items-center gap-x-2 px-4 lg:block lg:px-0">
        <div className="contents lg:grid lg:grid-cols-[1fr_auto_1fr] lg:items-center lg:gap-2 lg:px-4 lg:py-3 lg:border-b lg:border-border">
          <TeamHeader
            manager={pair.a.manager}
            winner={aWon || tied}
            side="a"
            padBottom={aTop === null}
          />
          <span className="hidden lg:block lg:col-start-2 text-[10px] uppercase tracking-[0.18em] text-foreground-subtle font-medium px-1">
            vs
          </span>
          <TeamHeader
            manager={pair.b.manager}
            winner={!aWon || tied}
            side="b"
            padBottom={bTop === null}
          />
        </div>

        <div className="contents lg:grid lg:grid-cols-[1fr_auto_1fr] lg:items-center lg:gap-2 lg:px-4 lg:py-4">
          <ScoreCell
            value={pair.a.matchup.points}
            precision={2}
            emphasis={aWon || tied ? "primary" : "muted"}
            className={`font-display text-2xl row-start-1 col-start-2 ${aTop === null ? "py-3" : "pt-3"} lg:py-0 lg:text-3xl lg:col-start-1 lg:justify-end`}
          />
          {tied ? (
            <Pill
              tone="neutral"
              size="sm"
              className="hidden lg:inline-flex lg:col-start-2 lg:justify-self-center"
            >
              Tie
            </Pill>
          ) : (
            <span className="hidden lg:block lg:col-start-2 text-[10px] uppercase tracking-[0.18em] text-foreground-subtle tabular text-center">
              {Math.abs(pair.margin).toFixed(2)}
            </span>
          )}
          <ScoreCell
            value={pair.b.matchup.points}
            precision={2}
            emphasis={!aWon || tied ? "primary" : "muted"}
            className={`font-display text-2xl row-start-4 col-start-2 ${bTop === null ? "py-3" : "pt-3"} lg:py-0 lg:text-3xl lg:row-start-1 lg:col-start-3`}
          />
        </div>

        {aTop || bTop ? (
          <div className="contents lg:grid lg:grid-cols-[1fr_auto_1fr] lg:items-center lg:gap-2 lg:px-4 lg:py-2.5 lg:border-t lg:border-border lg:bg-background/40">
            <TopPlayer spot={aTop} side="a" />
            <span className="hidden lg:block lg:col-start-2 text-[9px] uppercase tracking-[0.18em] text-foreground-subtle font-medium px-1">
              top
            </span>
            <TopPlayer spot={bTop} side="b" />
          </div>
        ) : null}

        {/* Phone-only band between the two team blocks. It carries no player or
            manager data — just the two static labels and the margin — so it is
            the one thing here that is cheaper to keep than to place. */}
        <div className="row-start-3 col-start-1 col-end-3 -mx-4 flex items-center justify-center gap-2 px-4 py-2 border-y border-border bg-background/40 lg:hidden">
          <span className="text-[10px] uppercase tracking-[0.18em] text-foreground-subtle font-medium">
            vs
          </span>
          {tied ? (
            <Pill tone="neutral" size="sm">Tie</Pill>
          ) : (
            <span className="text-[10px] uppercase tracking-[0.18em] text-foreground-subtle tabular">
              margin {Math.abs(pair.margin).toFixed(2)}
            </span>
          )}
        </div>
      </div>
      <div className="px-4 py-3 lg:py-2 border-t border-border lg:border-t-0 text-[10px] uppercase tracking-[0.18em] text-foreground-subtle group-hover:text-foreground-muted transition-colors text-right">
        Open rivalry →
      </div>
    </Link>
  );
}

/**
 * Manager identity for one side. Phones stack it above that team's score;
 * from `lg` it is the mirrored top row of the card grid. Placement and the
 * mirroring are `lg:` modifiers on one element, never a second element.
 */
function TeamHeader({
  manager,
  winner,
  side,
  padBottom,
}: {
  manager: Manager;
  winner: boolean;
  side: "a" | "b";
  /** Phone only: carries the block's bottom padding when no top scorer follows. */
  padBottom: boolean;
}) {
  const isA = side === "a";
  return (
    <div
      className={`flex items-center gap-2 min-w-0 col-start-1 ${
        padBottom ? "py-3" : "pt-3"
      } lg:py-0 lg:row-start-1 ${
        isA
          ? "row-start-1 lg:col-start-1 lg:flex-row-reverse lg:text-right"
          : "row-start-4 lg:col-start-3"
      }`}
    >
      <ManagerAvatar manager={manager} size={28} ring="subtle" />
      <span className="flex flex-col min-w-0">
        <span
          className={`text-sm truncate ${winner ? "text-foreground" : "text-foreground-muted"}`}
        >
          {manager.displayName}
        </span>
        <span className="text-[10px] text-foreground-subtle truncate">
          @{manager.username}
        </span>
      </span>
    </div>
  );
}

function TopPlayer({
  spot,
  side,
}: {
  spot:
    | {
        playerId: string;
        name: string;
        position: string;
        team: string | null;
        points: number;
      }
    | null;
  side: "a" | "b";
}) {
  const isA = side === "a";
  const place = isA
    ? "row-start-2 col-start-1 col-end-3 lg:row-start-1 lg:col-start-1 lg:col-end-2"
    : "row-start-5 col-start-1 col-end-3 lg:row-start-1 lg:col-start-3 lg:col-end-4";
  if (!spot) {
    // The stacked phone layout simply omits an absent top scorer; the mirrored
    // grid needs the placeholder to hold its column open.
    return (
      <span
        className={`hidden lg:block text-[11px] text-foreground-subtle ${place} ${
          isA ? "lg:text-right" : "lg:text-left"
        }`}
      >
        —
      </span>
    );
  }
  return (
    <div
      className={`flex items-center gap-2 min-w-0 pt-2 pb-3 lg:py-0 ${place} ${
        isA ? "lg:flex-row-reverse lg:text-right" : ""
      }`}
    >
      <span className="text-[9px] uppercase tracking-[0.18em] text-foreground-subtle font-medium shrink-0 lg:hidden">
        top
      </span>
      <PlayerImage
        playerId={spot.playerId}
        position={spot.position}
        name={spot.name}
        size={22}
        fallbackColor={positionColor(spot.position)}
      />
      <span
        className={`flex flex-col min-w-0 flex-1 lg:flex-initial ${isA ? "lg:items-end" : ""}`}
      >
        <span className="text-[11px] text-foreground-muted truncate">
          {spot.name}
        </span>
        <span className="text-[9px] text-foreground-subtle tabular truncate">
          {spot.team ?? "FA"} · {spot.position}
        </span>
      </span>
      <span
        className={`tabular text-[12px] font-medium text-foreground shrink-0 lg:w-12 ${
          isA ? "lg:text-left" : "lg:text-right"
        }`}
      >
        {spot.points.toFixed(1)}
      </span>
    </div>
  );
}
