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
              className="text-xs uppercase tracking-[0.18em] text-foreground-subtle hover:text-foreground transition-colors"
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
    <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-1 overflow-x-auto max-w-full">
      {weeks.map((w) => {
        const ww = String(w).padStart(2, "0");
        const isActive = w === active;
        return (
          <Link
            key={w}
            href={`/matchups/${season}/${ww}`}
            className={
              isActive
                ? "px-2.5 py-1 rounded-md bg-foreground/[0.06] font-display italic text-[15px] text-foreground shrink-0"
                : "px-2.5 py-1 rounded-md text-foreground-muted hover:text-foreground hover:bg-foreground/[0.03] text-[12px] tabular transition-colors shrink-0"
            }
          >
            {w}
          </Link>
        );
      })}
    </div>
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
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-3 border-b border-border">
        <TeamHeader manager={pair.a.manager} winner={aWon || tied} align="right" />
        <span className="text-[10px] uppercase tracking-[0.18em] text-foreground-subtle font-medium px-1">
          vs
        </span>
        <TeamHeader manager={pair.b.manager} winner={!aWon || tied} align="left" />
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-4">
        <div className="flex justify-end">
          <ScoreCell
            value={pair.a.matchup.points}
            precision={2}
            emphasis={aWon || tied ? "primary" : "muted"}
            className="font-display text-3xl"
          />
        </div>
        <div className="flex flex-col items-center gap-1">
          {tied ? (
            <Pill tone="neutral" size="sm">Tie</Pill>
          ) : (
            <span className="text-[10px] uppercase tracking-[0.18em] text-foreground-subtle tabular">
              {Math.abs(pair.margin).toFixed(2)}
            </span>
          )}
        </div>
        <div className="flex justify-start">
          <ScoreCell
            value={pair.b.matchup.points}
            precision={2}
            emphasis={!aWon || tied ? "primary" : "muted"}
            className="font-display text-3xl"
          />
        </div>
      </div>
      {aTop || bTop ? (
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-2.5 border-t border-border bg-background/40">
          <TopPlayer spot={aTop} align="right" />
          <span className="text-[9px] uppercase tracking-[0.18em] text-foreground-subtle font-medium px-1">
            top
          </span>
          <TopPlayer spot={bTop} align="left" />
        </div>
      ) : null}
      <div className="px-4 py-2 text-[10px] uppercase tracking-[0.18em] text-foreground-subtle group-hover:text-foreground-muted transition-colors text-right">
        Open rivalry →
      </div>
    </Link>
  );
}

function TeamHeader({
  manager,
  winner,
  align,
}: {
  manager: Manager;
  winner: boolean;
  align: "left" | "right";
}) {
  const isRight = align === "right";
  return (
    <div
      className={`flex items-center gap-2 min-w-0 ${isRight ? "flex-row-reverse text-right" : ""}`}
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
  align,
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
  align: "left" | "right";
}) {
  if (!spot) {
    return (
      <span
        className={`text-[11px] text-foreground-subtle ${align === "right" ? "text-right" : "text-left"}`}
      >
        —
      </span>
    );
  }
  const isRight = align === "right";
  return (
    <div
      className={`flex items-center gap-2 min-w-0 ${isRight ? "flex-row-reverse text-right" : ""}`}
    >
      <PlayerImage
        playerId={spot.playerId}
        position={spot.position}
        name={spot.name}
        size={22}
        fallbackColor={positionColor(spot.position)}
      />
      <span className={`flex flex-col min-w-0 ${isRight ? "items-end" : ""}`}>
        <span className="text-[11px] text-foreground-muted truncate">
          {spot.name}
        </span>
        <span className="text-[9px] text-foreground-subtle tabular">
          {spot.team ?? "FA"} · {spot.position}
        </span>
      </span>
      <span
        className={`tabular text-[12px] font-medium text-foreground shrink-0 ${isRight ? "text-left" : "text-right"} w-12`}
      >
        {spot.points.toFixed(1)}
      </span>
    </div>
  );
}
