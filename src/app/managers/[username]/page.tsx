import { Star } from "lucide-react";
import { notFound } from "next/navigation";

import { RosterValueSection } from "@/components/rankings/RosterValueSection";
import {
  Card,
  ExpandableRow,
  Kicker,
  ManagerAvatar,
  Pill,
  PlayerImage,
  SectionHeader,
  Sparkline,
  StatTile,
} from "@/components/ui";
import { ManagerSeasonReceipts } from "@/components/ui/ManagerSeasonReceipts";
import { managerOverrides } from "@/config/managers";
import {
  findManagerByUsername,
  getCurrentLeague,
  getManagerCareer,
  getRosterByUserId,
  getStandings,
  getWeeklyPointsByRoster,
  listCachedSeasons,
  readPlayers,
} from "@/lib/data";
import { buildDynastyRankings } from "@/lib/rankings";
import type { SeasonRoster } from "@/lib/types";
import type { SleeperPlayer } from "@/lib/sleeper";

interface PageProps {
  params: Promise<{ username: string }>;
}

const POSITION_ORDER = ["QB", "RB", "WR", "TE", "K", "DEF"] as const;
type GroupedPosition = (typeof POSITION_ORDER)[number] | "OTHER";

export default async function ManagerProfilePage({ params }: PageProps) {
  const { username } = await params;
  const found = await findManagerByUsername(username);
  if (!found) notFound();

  const { manager } = found;
  const override = managerOverrides[manager.userId];
  const career = await getManagerCareer(manager.userId);
  const { season: currentSeason } = await getCurrentLeague();
  const currentRoster = await getRosterByUserId(currentSeason, manager.userId);

  // Dynasty roster value — only meaningful if the manager has a roster in the
  // current league season.
  const dynasty = currentRoster ? await buildDynastyRankings() : null;
  const dynastyBreakdown = dynasty
    ? dynasty.rosters.find((r) => r.manager.userId === manager.userId)
    : null;
  const dynastyRank =
    dynasty && dynastyBreakdown
      ? dynasty.rosters.indexOf(dynastyBreakdown) + 1
      : null;

  // Build per-season weekly PF sparklines for the career strip.
  const seasons = await listCachedSeasons();
  const seasonSparks = new Map<string, number[]>();
  const seasonFinishes = new Map<string, number | null>();
  for (const s of seasons) {
    const wk = await getWeeklyPointsByRoster(s);
    const standings = await getStandings(s);
    const row = standings.find((r) => r.manager.userId === manager.userId);
    if (row) {
      seasonSparks.set(s, wk.get(row.rosterId) ?? []);
      const played = row.wins + row.losses + row.ties;
      seasonFinishes.set(s, played === 0 ? null : standings.indexOf(row) + 1);
    }
  }

  const totals = career?.totals ?? {
    wins: 0,
    losses: 0,
    ties: 0,
    pf: 0,
    pa: 0,
    ppts: 0,
  };
  const totalGames = totals.wins + totals.losses + totals.ties;
  const winPct = totalGames === 0 ? 0 : (totals.wins / totalGames) * 100;
  const finishes = career?.seasons
    .map((s) => s.finishRank)
    .filter((n): n is number => n !== null) ?? [];
  const avgFinish = finishes.length === 0
    ? null
    : finishes.reduce((a, b) => a + b, 0) / finishes.length;
  const lineupIqPct =
    totals.ppts > 0 ? Math.min(100, (totals.pf / totals.ppts) * 100) : null;
  const seasonsPlayed = career?.seasons.filter(
    (s) => s.wins + s.losses + s.ties > 0,
  ).length ?? 0;

  const accent = override?.accentColor ?? "#f5b54a";

  return (
    <main className="relative">
      {/* HERO */}
      <section className="relative overflow-hidden border-b border-border">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse 60% 50% at 0% 0%, ${accent}1f 0%, transparent 60%)`,
          }}
          aria-hidden
        />
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 pt-10 pb-10 sm:pt-14 sm:pb-14 flex flex-col sm:flex-row gap-6 sm:gap-10">
          <div
            className="shrink-0"
            style={{ viewTransitionName: `manager-card-${manager.userId}` }}
          >
            <ManagerAvatar
              manager={manager}
              size={140}
              ring={override?.accentColor ? "accent" : "gradient"}
              priority
            />
          </div>
          <div className="flex flex-col gap-2 min-w-0">
            <Kicker>
              Manager · @{manager.username}
              {override?.location ? ` · ${override.location}` : ""}
            </Kicker>
            <h1 className="font-display text-foreground text-5xl sm:text-7xl leading-[0.95] tracking-tight">
              {manager.displayName}
            </h1>
            {override?.bio ? (
              <p className="text-sm sm:text-base text-foreground-muted max-w-2xl mt-3 leading-relaxed">
                {override.bio}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2 mt-4">
              {override?.mode ? (
                <Pill tone="accent" size="md">
                  {override.mode}
                </Pill>
              ) : null}
              {override?.rookieOrVets ? (
                <Pill tone="secondary" size="md">
                  {override.rookieOrVets}
                </Pill>
              ) : null}
              {totalGames > 0 ? (
                <Pill
                  tone={winPct >= 50 ? "positive" : "negative"}
                  size="md"
                >
                  {winPct.toFixed(1)}% win
                </Pill>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* CAREER STATS */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-8 sm:mt-10">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatTile
            label="All-Time Record"
            value={`${totals.wins}-${totals.losses}${totals.ties ? `-${totals.ties}` : ""}`}
            subValue={`${totalGames} games`}
            accent="primary"
          />
          <StatTile
            label="Total PF"
            value={totals.pf}
            precision={0}
            accent="primary"
            subValue={`${(totalGames === 0 ? 0 : totals.pf / totalGames).toFixed(1)} avg`}
          />
          <StatTile
            label="Total PA"
            value={totals.pa}
            precision={0}
            subValue={`${(totalGames === 0 ? 0 : totals.pa / totalGames).toFixed(1)} avg`}
          />
          <StatTile
            label="Avg Finish"
            value={avgFinish !== null ? avgFinish.toFixed(1) : "—"}
            accent="secondary"
            animate={false}
            subValue={`${career?.seasons.length ?? 0} seasons`}
          />
          <StatTile
            label="Lineup IQ"
            value={lineupIqPct !== null ? lineupIqPct : "—"}
            precision={1}
            suffix={lineupIqPct !== null ? "%" : ""}
            animate={lineupIqPct !== null}
            subValue={
              lineupIqPct !== null
                ? `set ${(totals.pf / 1000).toFixed(1)}k of ${(totals.ppts / 1000).toFixed(1)}k possible across ${seasonsPlayed} ${seasonsPlayed === 1 ? "season" : "seasons"}`
                : "no completed seasons"
            }
          />
        </div>
      </section>

      {/* CAREER STRIP */}
      {career && career.seasons.length > 0 ? (
        <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-10 sm:mt-14 flex flex-col gap-4">
          <Kicker>Season By Season</Kicker>
          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {career.seasons.map((s) => {
              const wk = seasonSparks.get(s.season) ?? [];
              const finish = seasonFinishes.get(s.season) ?? null;
              return (
                <Card key={s.season} variant="default" padding="md">
                  <ExpandableRow
                    label={`Show ${s.season} weekly matchups`}
                    trigger={
                      <div>
                        <div className="flex items-baseline justify-between gap-2">
                          <Kicker>{s.season}</Kicker>
                          {finish ? (
                            <Pill
                              tone={finish === 1 ? "accent" : "neutral"}
                              size="sm"
                            >
                              #{finish}
                            </Pill>
                          ) : (
                            <Pill tone="neutral" size="sm">—</Pill>
                          )}
                        </div>
                        <div className="font-display text-3xl text-foreground mt-2 leading-none tabular">
                          {s.wins}-{s.losses}
                          {s.ties ? `-${s.ties}` : ""}
                        </div>
                        <div className="text-xs text-foreground-muted tabular mt-1">
                          {s.pf.toFixed(0)} PF · {s.pa.toFixed(0)} PA
                        </div>
                        {wk.length >= 2 ? (
                          <div className="mt-3 -mx-1">
                            <Sparkline
                              values={wk}
                              width={240}
                              height={28}
                              stroke="var(--accent-primary)"
                              fillGradient
                              className="text-accent w-full"
                              endDot={false}
                            />
                          </div>
                        ) : null}
                      </div>
                    }
                  >
                    <ManagerSeasonReceipts
                      season={s.season}
                      userId={manager.userId}
                    />
                  </ExpandableRow>
                </Card>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* ROSTER VALUE */}
      {dynasty && dynastyBreakdown && dynastyRank ? (
        <RosterValueSection
          breakdown={dynastyBreakdown}
          rank={dynastyRank}
          leagueAverage={dynasty.leagueAverages.total}
          snapshotDate={dynasty.snapshotDate}
        />
      ) : null}

      {/* CURRENT ROSTER */}
      {currentRoster ? (
        <CurrentRosterSection roster={currentRoster} season={currentSeason} />
      ) : null}
    </main>
  );
}

async function CurrentRosterSection({
  roster,
  season,
}: {
  roster: SeasonRoster;
  season: string;
}) {
  const players = await readPlayers();

  const starterSet = new Set(roster.starters);
  const reserveSet = new Set(roster.reserve);
  const taxiSet = new Set(roster.taxi);

  const groups = new Map<GroupedPosition, string[]>();
  for (const p of POSITION_ORDER) groups.set(p, []);
  groups.set("OTHER", []);

  for (const id of roster.allPlayers) {
    const pos = (players[id]?.position ?? null) as
      | (typeof POSITION_ORDER)[number]
      | null;
    const key: GroupedPosition = pos && (POSITION_ORDER as readonly string[]).includes(pos)
      ? pos
      : "OTHER";
    groups.get(key)?.push(id);
  }

  const orderedGroups = [...POSITION_ORDER, "OTHER" as const].filter(
    (k) => (groups.get(k) ?? []).length > 0,
  );

  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-12 sm:mt-16 flex flex-col gap-5">
      <SectionHeader
        kicker={`${season} Roster · ${roster.allPlayers.length} players`}
        title="The Roster"
        size="md"
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {orderedGroups.map((g) => {
          const ids = groups.get(g) ?? [];
          ids.sort((a, b) => {
            const aStarter = starterSet.has(a);
            const bStarter = starterSet.has(b);
            if (aStarter !== bStarter) return aStarter ? -1 : 1;
            return 0;
          });
          return (
            <Card key={g} variant="default" padding="md">
              <div className="flex items-baseline justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <PositionDot position={g} />
                  <span className="text-sm font-medium text-foreground">
                    {g === "OTHER" ? "Other" : g}
                  </span>
                </div>
                <span className="text-xs text-foreground-subtle tabular">
                  {ids.length}
                </span>
              </div>
              <ul className="flex flex-col">
                {ids.map((id) => {
                  const p = players[id];
                  const isStarter = starterSet.has(id);
                  const isTaxi = taxiSet.has(id);
                  const isReserve = reserveSet.has(id);
                  return (
                    <li
                      key={id}
                      className="flex items-center gap-3 py-2 border-b border-border/50 last:border-b-0"
                    >
                      {isStarter ? (
                        <Star
                          size={12}
                          strokeWidth={2}
                          className="text-accent shrink-0"
                          fill="currentColor"
                        />
                      ) : (
                        <span className="w-3 shrink-0" />
                      )}
                      <PlayerImage
                        playerId={id}
                        position={p?.position ?? "UNK"}
                        name={playerLabel(p, id)}
                        size={32}
                      />
                      <span className="flex flex-col min-w-0 flex-1">
                        <span className="text-sm text-foreground truncate">
                          {playerLabel(p, id)}
                        </span>
                        <span className="text-[11px] text-foreground-subtle tabular truncate">
                          {p?.team ?? "FA"}
                          {typeof p?.years_exp === "number"
                            ? ` · ${p.years_exp}y exp`
                            : ""}
                          {typeof p?.age === "number" ? ` · age ${p.age}` : ""}
                        </span>
                      </span>
                      {isTaxi ? <Pill tone="secondary" size="sm">Taxi</Pill> : null}
                      {isReserve ? <Pill tone="warning" size="sm">IR</Pill> : null}
                    </li>
                  );
                })}
              </ul>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

const POSITION_DOT: Record<string, string> = {
  QB: "bg-rose-500",
  RB: "bg-emerald-500",
  WR: "bg-sky-500",
  TE: "bg-amber-500",
  K: "bg-violet-500",
  DEF: "bg-slate-500",
  OTHER: "bg-foreground-subtle",
};

function PositionDot({ position }: { position: string }) {
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${POSITION_DOT[position] ?? "bg-foreground-subtle"}`}
      aria-hidden
    />
  );
}

function playerLabel(p: SleeperPlayer | undefined, id: string): string {
  if (!p) return id;
  if (p.full_name) return p.full_name;
  if (p.first_name && p.last_name) return `${p.first_name} ${p.last_name}`;
  return id;
}
