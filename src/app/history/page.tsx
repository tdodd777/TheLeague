import { ArrowUpRight, Trophy } from "lucide-react";
import Link from "next/link";

import {
  Card,
  EmptyState,
  Kicker,
  ManagerAvatar,
  Pill,
  SectionHeader,
} from "@/components/ui";
import { LEAGUE_NAME } from "@/config/site";
import {
  getBiggestTradeOfSeason,
  getManagers,
  getSeasonPlacements,
  getStandings,
  listCachedSeasons,
  readLeague,
  summarizeSides,
} from "@/lib/data";
import type { Manager } from "@/lib/types";

export const dynamic = "force-static";

export const metadata = {
  title: `History · ${LEAGUE_NAME}`,
  description:
    "Season-by-season standings, brackets, and the trades that defined each year.",
};

interface YearCard {
  season: string;
  status: string;
  champion: Manager | null;
  runnerUp: Manager | null;
  regularSeasonKing: { manager: Manager; record: string; pf: number } | null;
  biggestTrade: { transactionId: string; summary: string; assets: number } | null;
  hasGames: boolean;
}

export default async function HistoryIndexPage() {
  const seasons = await listCachedSeasons();

  const cards: YearCard[] = [];
  for (const season of seasons) {
    const [league, standings, placements, managers, biggest] = await Promise.all([
      readLeague(season),
      getStandings(season),
      getSeasonPlacements(season),
      getManagers(season),
      getBiggestTradeOfSeason(season).catch(() => null),
    ]);

    const champManager =
      placements.champion !== null
        ? managers.byRosterId.get(placements.champion) ?? null
        : null;
    const runnerUpManager =
      placements.runnerUp !== null
        ? managers.byRosterId.get(placements.runnerUp) ?? null
        : null;

    const regSeasonKing = standings[0];
    const hasGames = standings.some((s) => s.wins + s.losses + s.ties > 0);

    cards.push({
      season,
      status: league.status,
      champion: champManager,
      runnerUp: runnerUpManager,
      regularSeasonKing:
        regSeasonKing && hasGames
          ? {
              manager: regSeasonKing.manager,
              record: `${regSeasonKing.wins}-${regSeasonKing.losses}${regSeasonKing.ties ? `-${regSeasonKing.ties}` : ""}`,
              pf: regSeasonKing.pf,
            }
          : null,
      biggestTrade: biggest
        ? {
            transactionId: biggest.trade.transactionId,
            summary: summarizeSides(biggest.trade),
            assets: biggest.trade.assetCount,
          }
        : null,
      hasGames,
    });
  }

  if (cards.length === 0) {
    return (
      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-16">
        <EmptyState
          title="No archive yet"
          description="Past seasons appear here once the league cache has been refreshed."
        />
      </main>
    );
  }

  return (
    <main className="relative">
      <section className="relative overflow-hidden border-b border-border">
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 pt-10 pb-10 sm:pt-14 sm:pb-12">
          <SectionHeader
            kicker={`${cards.length} ${cards.length === 1 ? "year" : "years"} of receipts`}
            title="History"
            description="Every season the league has played, with champion, runner-up, regular-season king, and the trade that moved the most pieces."
            size="lg"
          />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-8 grid grid-cols-1 lg:grid-cols-2 gap-4">
        {cards.map((c) => (
          <YearCardItem key={c.season} card={c} />
        ))}
      </section>
    </main>
  );
}

function YearCardItem({ card }: { card: YearCard }) {
  const inProgress =
    !card.champion && card.hasGames && card.status !== "complete";

  return (
    <Card variant="interactive" padding="lg" as="article">
      <Link href={`/history/${card.season}`} className="flex flex-col gap-5 group">
        <div className="flex items-baseline justify-between gap-3">
          <Kicker>
            <Trophy
              className="inline-block mr-1.5 mb-0.5"
              size={11}
              strokeWidth={2}
            />
            Season {card.season}
          </Kicker>
          <ArrowUpRight
            size={18}
            strokeWidth={1.5}
            className="text-foreground-subtle group-hover:text-accent transition-colors"
          />
        </div>

        {/* Champion / runner-up */}
        {card.champion ? (
          <div className="flex items-center gap-4">
            <ManagerAvatar
              manager={card.champion}
              size={64}
              ring="gradient"
            />
            <div className="flex flex-col gap-1 min-w-0">
              <span className="font-display text-2xl sm:text-3xl text-foreground leading-tight truncate">
                {card.champion.displayName}
              </span>
              <span className="flex items-center gap-2 text-xs text-foreground-muted truncate">
                <Pill tone="accent" size="sm">
                  Champion
                </Pill>
                {card.runnerUp ? (
                  <span className="truncate">
                    over @{card.runnerUp.username}
                  </span>
                ) : null}
              </span>
            </div>
          </div>
        ) : inProgress ? (
          <div className="flex items-center gap-3 text-sm text-foreground-muted">
            <Pill tone="warning" size="sm">
              In Progress
            </Pill>
            <span>Champion TBD</span>
          </div>
        ) : (
          <div className="flex items-center gap-3 text-sm text-foreground-muted">
            <Pill tone="neutral" size="sm">
              No champion yet
            </Pill>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {card.regularSeasonKing ? (
            <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface px-3 py-2.5">
              <span className="text-[10px] uppercase tracking-[0.18em] text-foreground-subtle">
                Regular-Season King
              </span>
              <span className="text-sm text-foreground truncate">
                @{card.regularSeasonKing.manager.username}
              </span>
              <span className="text-[11px] tabular text-foreground-muted">
                {card.regularSeasonKing.record} · {card.regularSeasonKing.pf.toFixed(1)} PF
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface px-3 py-2.5 text-foreground-subtle">
              <span className="text-[10px] uppercase tracking-[0.18em]">
                Regular Season
              </span>
              <span className="text-sm">— hasn&apos;t started yet</span>
            </div>
          )}

          {card.biggestTrade ? (
            <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface px-3 py-2.5 min-w-0">
              <span className="text-[10px] uppercase tracking-[0.18em] text-foreground-subtle">
                Biggest Trade
              </span>
              <span className="text-[11px] text-foreground-muted truncate">
                {card.biggestTrade.summary}
              </span>
              <span className="text-[11px] tabular text-foreground-subtle">
                {card.biggestTrade.assets}-asset deal
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface px-3 py-2.5 text-foreground-subtle">
              <span className="text-[10px] uppercase tracking-[0.18em]">
                Trades
              </span>
              <span className="text-sm">No trades on file.</span>
            </div>
          )}
        </div>
      </Link>
    </Card>
  );
}
