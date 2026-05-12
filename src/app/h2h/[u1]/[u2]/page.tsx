import { ChevronDown, Star } from "lucide-react";
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
  StatTile,
} from "@/components/ui";
import {
  buildH2HMatrix,
  findManagerByUsername,
  getManagers,
  getMatchupLineups,
} from "@/lib/data";
import { readLeague } from "@/lib/data/cache";
import type { RosterLineup } from "@/lib/data";
import type { Manager } from "@/lib/types";

export const dynamic = "force-static";

interface PageProps {
  params: Promise<{ u1: string; u2: string }>;
}

export default async function H2HRivalryPage({ params }: PageProps) {
  const { u1, u2 } = await params;
  const [a, b] = await Promise.all([
    findManagerByUsername(u1),
    findManagerByUsername(u2),
  ]);
  if (!a || !b) notFound();
  if (a.manager.userId === b.manager.userId) notFound();

  const matrix = await buildH2HMatrix();
  const cell =
    matrix.cells.get(a.manager.userId)?.get(b.manager.userId) ?? null;
  const meetings =
    matrix.meetings.get(a.manager.userId)?.get(b.manager.userId) ?? [];

  if (!cell) notFound();

  const total = cell.wins + cell.losses + cell.ties;
  const winPct = total > 0 ? ((cell.wins + cell.ties * 0.5) / total) * 100 : 0;
  const ppg = total > 0 ? cell.pf / total : 0;
  const oppPpg = total > 0 ? cell.pa / total : 0;

  // Sort meetings descending by season then week.
  const sorted = [...meetings].sort((m1, m2) => {
    if (m1.season !== m2.season) return m2.season.localeCompare(m1.season);
    return m2.week - m1.week;
  });

  // Group by season.
  const bySeason = new Map<string, typeof sorted>();
  for (const m of sorted) {
    const arr = bySeason.get(m.season) ?? [];
    arr.push(m);
    bySeason.set(m.season, arr);
  }

  // Resolve roster IDs + playoff_week_start per season the pair met (managers
  // can change roster_id across seasons), then load lineups for every meeting
  // in parallel. Each meeting becomes a {meeting, lineups | null} tuple.
  const seasonRosterIds = new Map<
    string,
    {
      rosterIdA: number | null;
      rosterIdB: number | null;
      playoffWeekStart: number;
    }
  >();
  await Promise.all(
    [...bySeason.keys()].map(async (season) => {
      const [lookup, league] = await Promise.all([
        getManagers(season),
        readLeague(season),
      ]);
      seasonRosterIds.set(season, {
        rosterIdA: lookup.byUserId.get(a.manager.userId)?.rosterId ?? null,
        rosterIdB: lookup.byUserId.get(b.manager.userId)?.rosterId ?? null,
        playoffWeekStart: league.settings.playoff_week_start || 15,
      });
    }),
  );

  type MeetingWithLineups = (typeof sorted)[number] & {
    lineups: { a: RosterLineup; b: RosterLineup } | null;
    isPlayoff: boolean;
  };
  const enriched: MeetingWithLineups[] = await Promise.all(
    sorted.map(async (m) => {
      const ids = seasonRosterIds.get(m.season);
      const isPlayoff = ids ? m.week >= ids.playoffWeekStart : false;
      if (!ids?.rosterIdA || !ids?.rosterIdB) {
        return { ...m, lineups: null, isPlayoff };
      }
      const lineups = await getMatchupLineups(
        m.season,
        m.week,
        ids.rosterIdA,
        ids.rosterIdB,
      );
      return { ...m, lineups, isPlayoff };
    }),
  );

  const enrichedBySeason = new Map<string, MeetingWithLineups[]>();
  for (const m of enriched) {
    const arr = enrichedBySeason.get(m.season) ?? [];
    arr.push(m);
    enrichedBySeason.set(m.season, arr);
  }

  // Largest blowout (by points scored by A).
  const biggestWin = [...meetings]
    .filter((m) => m.result === "W")
    .sort((m1, m2) => m2.myScore - m2.oppScore - (m1.myScore - m1.oppScore))[0];
  const biggestLoss = [...meetings]
    .filter((m) => m.result === "L")
    .sort((m1, m2) => m1.myScore - m1.oppScore - (m2.myScore - m2.oppScore))[0];
  // Closest game by absolute margin.
  const closestGame = [...meetings].sort(
    (m1, m2) => Math.abs(m1.myScore - m1.oppScore) - Math.abs(m2.myScore - m2.oppScore),
  )[0];

  // Current streak from manager A's perspective. Walk meetings in chronological
  // order; the streak is the trailing run of identical results.
  const chronological = [...meetings].sort((m1, m2) => {
    if (m1.season !== m2.season) return m1.season.localeCompare(m2.season);
    return m1.week - m2.week;
  });
  let streakResult: "W" | "L" | "T" | null = null;
  let streakLength = 0;
  for (let i = chronological.length - 1; i >= 0; i -= 1) {
    const m = chronological[i];
    if (!m) break;
    if (streakResult === null) {
      streakResult = m.result;
      streakLength = 1;
      continue;
    }
    if (m.result === streakResult) streakLength += 1;
    else break;
  }
  const lastWin = [...chronological].reverse().find((m) => m.result === "W");
  const lastLoss = [...chronological].reverse().find((m) => m.result === "L");
  const aUsername = a.manager.username;
  const bUsername = b.manager.username;

  function streakLine(): string | null {
    if (streakResult === null || streakLength === 0) return null;
    if (streakResult === "W") {
      return streakLength === 1
        ? `@${aUsername} won the most recent meeting.`
        : `@${aUsername} is on a ${streakLength}-game win streak.`;
    }
    if (streakResult === "L") {
      const since = lastWin
        ? `since ${lastWin.season} week ${lastWin.week}`
        : `ever`;
      return streakLength === 1
        ? `@${aUsername} lost the most recent meeting.`
        : `@${aUsername} hasn't beaten @${bUsername} ${since} (${streakLength} straight losses).`;
    }
    return `Last meeting was a tie.`;
  }
  void lastLoss;

  return (
    <main className="relative">
      <section className="relative overflow-hidden border-b border-border">
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 pt-10 pb-10 sm:pt-14 sm:pb-12">
          <div className="flex items-center gap-4 mb-4">
            <Link
              href="/h2h"
              className="text-xs uppercase tracking-[0.18em] text-foreground-subtle hover:text-foreground transition-colors"
            >
              ← all matchups
            </Link>
          </div>
          <SectionHeader
            kicker={`Rivalry · ${total} meetings`}
            title={
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Link
                  href={`/managers/${a.manager.username}`}
                  className="hover:text-accent transition-colors"
                >
                  {a.manager.displayName}
                </Link>
                <span className="text-foreground-subtle text-2xl">vs</span>
                <Link
                  href={`/managers/${b.manager.username}`}
                  className="hover:text-accent transition-colors"
                >
                  {b.manager.displayName}
                </Link>
              </span>
            }
            description={`Lifetime ${cell.wins}-${cell.losses}${cell.ties ? `-${cell.ties}` : ""} for @${a.manager.username}, ${ppg.toFixed(1)} PF / ${oppPpg.toFixed(1)} PA per game.${streakLine() ? " " + streakLine() : ""}`}
            size="lg"
          />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile
          label="Record"
          value={`${cell.wins}-${cell.losses}${cell.ties ? `-${cell.ties}` : ""}`}
          accent="primary"
          animate={false}
          subValue={`${winPct.toFixed(1)}% win`}
        />
        <StatTile
          label="PF / game"
          value={ppg}
          precision={1}
          subValue={`${cell.pf.toFixed(0)} total`}
        />
        <StatTile
          label="PA / game"
          value={oppPpg}
          precision={1}
          subValue={`${cell.pa.toFixed(0)} total`}
        />
        {closestGame ? (
          <StatTile
            label="Closest game"
            value={Math.abs(closestGame.myScore - closestGame.oppScore)}
            precision={1}
            prefix={
              closestGame.myScore === closestGame.oppScore
                ? ""
                : closestGame.myScore > closestGame.oppScore
                  ? "+"
                  : "−"
            }
            animate={false}
            subValue={`${closestGame.season} wk ${closestGame.week} · ${closestGame.myScore.toFixed(1)}—${closestGame.oppScore.toFixed(1)}`}
          />
        ) : (
          <StatTile
            label="Net margin"
            value={ppg - oppPpg}
            precision={1}
            prefix={ppg - oppPpg >= 0 ? "+" : ""}
            accent={ppg - oppPpg >= 0 ? "secondary" : null}
            animate={false}
            subValue="per meeting"
          />
        )}
      </section>

      {biggestWin || biggestLoss ? (
        <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {biggestWin ? (
            <Card variant="default" padding="md">
              <Kicker>Biggest win</Kicker>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-display text-4xl text-positive tabular leading-none">
                  +{(biggestWin.myScore - biggestWin.oppScore).toFixed(1)}
                </span>
                <span className="text-sm text-foreground-muted tabular">
                  {biggestWin.myScore.toFixed(1)}—{biggestWin.oppScore.toFixed(1)}
                </span>
              </div>
              <span className="text-xs text-foreground-subtle tabular mt-1 block">
                {biggestWin.season} · week {biggestWin.week}
              </span>
            </Card>
          ) : null}
          {biggestLoss ? (
            <Card variant="default" padding="md">
              <Kicker>Worst beating</Kicker>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-display text-4xl text-negative tabular leading-none">
                  {(biggestLoss.myScore - biggestLoss.oppScore).toFixed(1)}
                </span>
                <span className="text-sm text-foreground-muted tabular">
                  {biggestLoss.myScore.toFixed(1)}—{biggestLoss.oppScore.toFixed(1)}
                </span>
              </div>
              <span className="text-xs text-foreground-subtle tabular mt-1 block">
                {biggestLoss.season} · week {biggestLoss.week}
              </span>
            </Card>
          ) : null}
        </section>
      ) : null}

      {/* Per-season meeting list */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-12 sm:mt-16 flex flex-col gap-6">
        <Kicker>Receipts</Kicker>
        {[...enrichedBySeason].map(([season, list]) => (
          <div key={season} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <span className="font-display text-2xl text-foreground tabular leading-none">
                {season}
              </span>
              <span className="text-xs text-foreground-subtle tabular">
                {list.length} {list.length === 1 ? "meeting" : "meetings"}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {list.map((m) => (
                <MeetingDetails
                  key={`${m.season}-${m.week}`}
                  meeting={m}
                  managerA={a.manager}
                  managerB={b.manager}
                />
              ))}
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}

interface EnrichedMeeting {
  season: string;
  week: number;
  myScore: number;
  oppScore: number;
  result: "W" | "L" | "T";
  lineups: { a: RosterLineup; b: RosterLineup } | null;
  isPlayoff: boolean;
}

function MeetingDetails({
  meeting,
  managerA,
  managerB,
}: {
  meeting: EnrichedMeeting;
  managerA: Manager;
  managerB: Manager;
}) {
  const margin = meeting.myScore - meeting.oppScore;
  const tone =
    meeting.result === "W"
      ? "positive"
      : meeting.result === "L"
        ? "negative"
        : "neutral";

  return (
    <details className="group rounded-xl border border-border bg-surface overflow-hidden">
      <summary className="cursor-pointer list-none flex items-center gap-3 px-4 py-3 hover:bg-foreground/[0.025] transition-colors">
        <Pill tone={tone} size="sm">
          {meeting.result}
        </Pill>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <ManagerAvatar manager={managerA} size={22} />
          <ScoreCell value={meeting.myScore} precision={1} />
          <span className="text-foreground-subtle text-xs">vs</span>
          <ScoreCell value={meeting.oppScore} precision={1} emphasis="muted" />
          <ManagerAvatar manager={managerB} size={22} />
        </div>
        {meeting.isPlayoff ? (
          <Pill tone="accent" size="sm">
            Playoffs
          </Pill>
        ) : null}
        <span className="text-[11px] text-foreground-subtle tabular hidden sm:inline">
          Week {meeting.week} · margin{" "}
          <span className={margin >= 0 ? "text-positive" : "text-negative"}>
            {margin >= 0 ? "+" : ""}
            {margin.toFixed(1)}
          </span>
        </span>
        <ChevronDown
          size={14}
          strokeWidth={1.75}
          className="text-foreground-subtle transition-transform group-open:rotate-180 shrink-0"
        />
      </summary>
      {meeting.lineups ? (
        <LineupBoard
          managerA={managerA}
          managerB={managerB}
          lineupA={meeting.lineups.a}
          lineupB={meeting.lineups.b}
          aWon={meeting.result === "W"}
          bWon={meeting.result === "L"}
        />
      ) : (
        <div className="px-4 pb-4 text-xs text-foreground-subtle">
          Lineup data unavailable for this week.
        </div>
      )}
    </details>
  );
}

function LineupBoard({
  managerA,
  managerB,
  lineupA,
  lineupB,
  aWon,
  bWon,
}: {
  managerA: Manager;
  managerB: Manager;
  lineupA: RosterLineup;
  lineupB: RosterLineup;
  aWon: boolean;
  bWon: boolean;
}) {
  // Pair starters slot-by-slot. Both rosters used the same roster_positions
  // order so indices line up.
  const pairCount = Math.max(lineupA.starters.length, lineupB.starters.length);
  const pairs: Array<{
    slot: string;
    a: (typeof lineupA.starters)[number] | null;
    b: (typeof lineupB.starters)[number] | null;
    /** Per-slot margin from A's perspective. */
    margin: number;
    /** Absolute margin — used to detect the swing slot. */
    absMargin: number;
  }> = [];
  for (let i = 0; i < pairCount; i += 1) {
    const sa = lineupA.starters[i] ?? null;
    const sb = lineupB.starters[i] ?? null;
    const ap = sa?.points ?? 0;
    const bp = sb?.points ?? 0;
    pairs.push({
      slot: sa?.slot ?? sb?.slot ?? "?",
      a: sa,
      b: sb,
      margin: ap - bp,
      absMargin: Math.abs(ap - bp),
    });
  }
  // Identify the biggest-swing slot (decided the matchup most).
  const swingIndex = pairs.reduce(
    (best, row, i) => (row.absMargin > (pairs[best]?.absMargin ?? -1) ? i : best),
    0,
  );

  return (
    <div className="border-t border-border bg-background/40">
      {/* Roster headers */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 justify-end min-w-0">
          {aWon ? (
            <Star
              size={11}
              strokeWidth={2}
              fill="currentColor"
              className="text-accent shrink-0"
            />
          ) : null}
          <span className="text-xs text-foreground-muted truncate">
            {managerA.displayName}
          </span>
          <ManagerAvatar manager={managerA} size={22} ring="subtle" />
        </div>
        <span className="text-[10px] uppercase tracking-[0.18em] text-foreground-subtle px-2">
          slot
        </span>
        <div className="flex items-center gap-2 min-w-0">
          <ManagerAvatar manager={managerB} size={22} ring="subtle" />
          <span className="text-xs text-foreground-muted truncate">
            {managerB.displayName}
          </span>
          {bWon ? (
            <Star
              size={11}
              strokeWidth={2}
              fill="currentColor"
              className="text-accent shrink-0"
            />
          ) : null}
        </div>
      </div>

      {/* Starter rows */}
      <ul className="flex flex-col">
        {pairs.map((row, i) => {
          const isSwing = i === swingIndex && row.absMargin > 0;
          // Subtle row tint: green-side wins the slot, red-side loses it.
          const aWonSlot = row.margin > 0;
          const bWonSlot = row.margin < 0;
          return (
            <li
              key={`${row.slot}-${i}`}
              className={`grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-1.5 border-b border-border/40 last:border-b-0 ${
                isSwing ? "bg-accent-soft/20" : ""
              }`}
            >
              <PlayerCell
                spot={row.a}
                align="right"
                winner={aWon}
                wonSlot={aWonSlot}
              />
              <span className="flex flex-col items-center gap-0.5 px-2 w-14 shrink-0">
                <span
                  className={`text-[10px] uppercase tracking-[0.16em] font-medium tabular ${isSwing ? "text-accent" : "text-foreground-subtle"}`}
                >
                  {row.slot}
                </span>
                {isSwing ? (
                  <span className="text-[8px] uppercase tracking-[0.18em] text-accent font-medium leading-none">
                    swing
                  </span>
                ) : null}
              </span>
              <PlayerCell
                spot={row.b}
                align="left"
                winner={bWon}
                wonSlot={bWonSlot}
              />
            </li>
          );
        })}

        {/* Totals: actual + projection */}
        <li className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-2 border-t border-border bg-foreground/[0.02]">
          <div className="flex flex-col items-end gap-0.5">
            <span
              className={`tabular font-display text-xl ${aWon ? "text-foreground" : "text-foreground-muted"}`}
            >
              {lineupA.totalPoints.toFixed(2)}
            </span>
            {lineupA.projectedTotal !== null ? (
              <span className="text-[10px] tabular text-foreground-subtle">
                proj {lineupA.projectedTotal.toFixed(1)}{" "}
                <span
                  className={
                    lineupA.totalPoints - lineupA.projectedTotal >= 0
                      ? "text-positive"
                      : "text-negative"
                  }
                >
                  ({lineupA.totalPoints - lineupA.projectedTotal >= 0 ? "+" : ""}
                  {(lineupA.totalPoints - lineupA.projectedTotal).toFixed(1)})
                </span>
              </span>
            ) : null}
          </div>
          <span className="text-[10px] uppercase tracking-[0.16em] text-foreground-subtle font-medium px-2 text-center w-14">
            total
          </span>
          <div className="flex flex-col items-start gap-0.5">
            <span
              className={`tabular font-display text-xl ${bWon ? "text-foreground" : "text-foreground-muted"}`}
            >
              {lineupB.totalPoints.toFixed(2)}
            </span>
            {lineupB.projectedTotal !== null ? (
              <span className="text-[10px] tabular text-foreground-subtle">
                proj {lineupB.projectedTotal.toFixed(1)}{" "}
                <span
                  className={
                    lineupB.totalPoints - lineupB.projectedTotal >= 0
                      ? "text-positive"
                      : "text-negative"
                  }
                >
                  ({lineupB.totalPoints - lineupB.projectedTotal >= 0 ? "+" : ""}
                  {(lineupB.totalPoints - lineupB.projectedTotal).toFixed(1)})
                </span>
              </span>
            ) : null}
          </div>
        </li>

        {/* "Left on the bench" callouts */}
        {lineupA.pointsLeftOnBench >= 1 || lineupB.pointsLeftOnBench >= 1 ? (
          <li className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-1.5 border-t border-border/60 text-[11px]">
            <span className="text-right text-foreground-subtle tabular">
              {lineupA.pointsLeftOnBench >= 1
                ? `−${lineupA.pointsLeftOnBench.toFixed(1)} left on bench (best lineup ${lineupA.optimalPoints.toFixed(1)})`
                : "optimal lineup ✓"}
            </span>
            <span className="text-[9px] uppercase tracking-[0.18em] text-foreground-subtle font-medium px-2 text-center w-14">
              lineup
            </span>
            <span className="text-left text-foreground-subtle tabular">
              {lineupB.pointsLeftOnBench >= 1
                ? `−${lineupB.pointsLeftOnBench.toFixed(1)} left on bench (best lineup ${lineupB.optimalPoints.toFixed(1)})`
                : "optimal lineup ✓"}
            </span>
          </li>
        ) : null}
      </ul>

      {/* Bench */}
      {lineupA.bench.length > 0 || lineupB.bench.length > 0 ? (
        <details className="group/bench border-t border-border">
          <summary className="cursor-pointer list-none flex items-center gap-2 px-4 py-2 text-[11px] uppercase tracking-[0.16em] text-foreground-subtle hover:text-foreground transition-colors">
            <ChevronDown
              size={11}
              strokeWidth={2}
              className="transition-transform group-open/bench:rotate-180"
            />
            Bench
          </summary>
          <ul className="flex flex-col pb-2">
            {Array.from(
              { length: Math.max(lineupA.bench.length, lineupB.bench.length) },
              (_unused, i) => i,
            ).map((i) => {
              const ba = lineupA.bench[i];
              const bb = lineupB.bench[i];
              return (
                <li
                  key={`bench-${i}`}
                  className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-1 text-foreground-muted"
                >
                  <BenchCell spot={ba} align="right" />
                  <span className="text-[9px] uppercase tracking-[0.16em] text-foreground-subtle px-2 text-center w-12">
                    BN
                  </span>
                  <BenchCell spot={bb} align="left" />
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function PlayerCell({
  spot,
  align,
  winner,
  wonSlot,
}: {
  spot:
    | {
        playerId: string;
        name: string;
        position: string;
        team: string | null;
        points: number;
        projection: number | null;
      }
    | null;
  align: "left" | "right";
  winner: boolean;
  wonSlot: boolean;
}) {
  if (!spot) {
    return (
      <span
        className={`text-xs text-foreground-subtle ${align === "right" ? "text-right" : "text-left"}`}
      >
        —
      </span>
    );
  }
  const isRight = align === "right";
  const delta =
    spot.projection !== null ? spot.points - spot.projection : null;
  return (
    <div
      className={`flex items-center gap-2 min-w-0 ${isRight ? "flex-row-reverse text-right" : ""}`}
    >
      <PlayerImage
        playerId={spot.playerId}
        position={spot.position}
        name={spot.name}
        size={28}
        fallbackColor={positionColor(spot.position)}
      />
      <span
        className={`flex flex-col min-w-0 flex-1 ${isRight ? "items-end" : ""}`}
      >
        <span
          className={`text-sm truncate ${winner ? "text-foreground" : "text-foreground-muted"}`}
        >
          {spot.name}
        </span>
        <span className="text-[10px] text-foreground-subtle tabular truncate">
          {spot.team ?? "FA"} · {spot.position}
        </span>
      </span>
      <span
        className={`flex flex-col shrink-0 w-14 tabular ${isRight ? "items-start text-left" : "items-end text-right"}`}
      >
        <span
          className={`text-sm font-medium ${wonSlot ? "text-positive" : winner ? "text-foreground" : "text-foreground-muted"}`}
        >
          {spot.points.toFixed(2)}
        </span>
        {spot.projection !== null && delta !== null ? (
          <span className="text-[10px] text-foreground-subtle">
            <span className="opacity-70">{spot.projection.toFixed(1)}</span>{" "}
            <span
              className={
                delta >= 0 ? "text-positive" : "text-negative"
              }
            >
              {delta >= 0 ? "+" : ""}
              {delta.toFixed(1)}
            </span>
          </span>
        ) : null}
      </span>
    </div>
  );
}

function BenchCell({
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
        projection: number | null;
      }
    | undefined;
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
        size={20}
        fallbackColor={positionColor(spot.position)}
      />
      <span className="text-[11px] text-foreground-muted truncate flex-1">
        {spot.name}
      </span>
      <span
        className={`tabular text-[11px] shrink-0 w-10 ${isRight ? "text-left" : "text-right"}`}
      >
        {spot.points.toFixed(1)}
      </span>
    </div>
  );
}
