import Link from "next/link";
import { Fragment } from "react";

import { Card, Kicker, PlayerImage, ScoreCell, SectionHeader } from "@/components/ui";
import {
  FRANCHISE_HISTORY_SCOPE_NOTE,
  formatSeasonRanges,
  type FranchiseHistory,
  type FranchiseMoveNote,
} from "@/lib/data/franchise-history";
import type { SleeperPlayer } from "@/lib/sleeper";

type PlayerMap = Record<string, SleeperPlayer>;

/** Sleeper defenses use alphabetic team codes; short numeric IDs are players. */
function isSleeperDefenseId(id: string): boolean {
  return /^[A-Z]{2,3}$/.test(id);
}

function playerName(players: PlayerMap, id: string): string {
  const p = players[id];
  if (p?.full_name) return p.full_name;
  if (p?.first_name && p.last_name) return `${p.first_name} ${p.last_name}`;
  return id;
}

function playerPosition(players: PlayerMap, id: string): string {
  return players[id]?.position ?? (isSleeperDefenseId(id) ? "DEF" : "UNK");
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** "2020–2021, 2023–2025", with each range kept on one line so it never splits at the dash. */
function SeasonRanges({ seasons }: { seasons: readonly string[] }) {
  return (
    <>
      {formatSeasonRanges(seasons)
        .split(", ")
        .map((range, i) => (
          <Fragment key={range}>
            {i > 0 ? ", " : null}
            <span className="whitespace-nowrap">{range}</span>
          </Fragment>
        ))}
    </>
  );
}

const MOVE_DATE = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
  timeZone: "America/New_York",
});

/** "Traded to <team> (Nov 2026)", with the team linked. */
function MoveLine({ note }: { note: FranchiseMoveNote | undefined }) {
  if (!note) return null;
  const when = MOVE_DATE.format(new Date(note.at));
  const label =
    note.kind === "acquired"
      ? "Acquired from"
      : note.kind === "traded-away"
        ? "Traded to"
        : "Dropped";
  return (
    <span className="text-foreground-muted text-[11px] break-words">
      {label}
      {note.team ? (
        <>
          {" "}
          <Link
            href={`/managers/${note.team.username}`}
            className="hover:text-accent underline underline-offset-2 transition-colors"
          >
            {note.team.name}
          </Link>
        </>
      ) : null}{" "}
      {/* Kept whole so a narrow column breaks after the team, not inside the date. */}
      <span className="whitespace-nowrap">({when})</span>
    </span>
  );
}

/** Server-only: renders a manager's all-time scorers, tenure and best games. */
export function FranchiseHistorySection({
  history,
  players,
}: {
  history: FranchiseHistory;
  players: PlayerMap;
}) {
  const { scorers, tenure, bestGames, moves, seasonsCounted, lastGame } = history;
  if (scorers.length === 0 && tenure.length === 0) return null;
  const since = seasonsCounted[0];
  const through = lastGame ? `through ${lastGame.season} week ${lastGame.week}` : null;
  const kicker = [since ? `Since ${since}` : null, through].filter(Boolean).join(" · ");

  return (
    <section className="mx-auto mt-10 flex max-w-6xl flex-col gap-5 px-4 sm:mt-14 sm:px-6">
      <SectionHeader
        kicker={kicker || "Franchise history"}
        title="Franchise History"
        description={FRANCHISE_HISTORY_SCOPE_NOTE}
        size="md"
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card variant="default" padding="none" className="p-4 sm:p-8">
          <Kicker>All-time leading scorers</Kicker>
          <ol className="mt-4 flex flex-col">
            {scorers.map((row, i) => (
              <li
                key={row.playerId}
                className="border-border/50 flex items-center gap-2.5 border-b py-2 last:border-b-0 sm:gap-3"
              >
                <span className="tabular text-foreground-subtle w-5 shrink-0 text-right text-[10px]">
                  {i + 1}
                </span>
                <PlayerImage
                  playerId={row.playerId}
                  position={playerPosition(players, row.playerId)}
                  name={playerName(players, row.playerId)}
                  size={28}
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-foreground text-sm leading-snug break-words">
                    {playerName(players, row.playerId)}
                  </span>
                  <span className="text-foreground-subtle tabular text-[11px] break-words">
                    {playerPosition(players, row.playerId)} ·{" "}
                    <span className="whitespace-nowrap">{plural(row.starts, "start")}</span> ·{" "}
                    <SeasonRanges seasons={row.seasons} />
                  </span>
                  <MoveLine note={moves.get(row.playerId)} />
                </span>
                <ScoreCell value={row.points} precision={1} />
              </li>
            ))}
          </ol>
        </Card>

        <Card variant="default" padding="none" className="p-4 sm:p-8">
          <Kicker>Longest tenure</Kicker>
          <ol className="mt-4 flex flex-col">
            {tenure.map((row, i) => (
              <li
                key={row.playerId}
                className="border-border/50 flex items-center gap-2.5 border-b py-2 last:border-b-0 sm:gap-3"
              >
                <span className="tabular text-foreground-subtle w-5 shrink-0 text-right text-[10px]">
                  {i + 1}
                </span>
                <PlayerImage
                  playerId={row.playerId}
                  position={playerPosition(players, row.playerId)}
                  name={playerName(players, row.playerId)}
                  size={28}
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-foreground text-sm leading-snug break-words">
                    {playerName(players, row.playerId)}
                  </span>
                  <span className="text-foreground-subtle tabular text-[11px] break-words">
                    {playerPosition(players, row.playerId)} · <SeasonRanges seasons={row.seasons} />
                    {row.current || moves.has(row.playerId) ? "" : " · former"}
                  </span>
                  <MoveLine note={moves.get(row.playerId)} />
                </span>
                {/* Number over a small label keeps the column narrow on phones. */}
                <span className="flex shrink-0 flex-col items-end leading-none">
                  <span className="text-foreground tabular text-sm">{row.seasons.length}</span>
                  <span className="text-foreground-subtle mt-1 text-[10px]">
                    {row.seasons.length === 1 ? "season" : "seasons"}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </Card>

        <Card variant="default" padding="none" className="p-4 sm:p-8">
          <Kicker>Best single games</Kicker>
          <ol className="mt-4 flex flex-col">
            {bestGames.map((row, i) => (
              <li
                key={`${row.playerId}-${row.season}-${row.week}`}
                className="border-border/50 flex items-center gap-2.5 border-b py-2 last:border-b-0 sm:gap-3"
              >
                <span className="tabular text-foreground-subtle w-5 shrink-0 text-right text-[10px]">
                  {i + 1}
                </span>
                <PlayerImage
                  playerId={row.playerId}
                  position={playerPosition(players, row.playerId)}
                  name={playerName(players, row.playerId)}
                  size={28}
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-foreground text-sm leading-snug break-words">
                    {playerName(players, row.playerId)}
                  </span>
                  <span className="text-foreground-subtle tabular text-[11px] break-words">
                    {row.season} wk {row.week}
                    {row.phase === "playoff" ? " · playoffs" : ""}
                  </span>
                </span>
                <ScoreCell value={row.points} precision={2} />
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </section>
  );
}
