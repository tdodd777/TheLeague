import { ArrowRightLeft, ArrowUpRight } from "lucide-react";
import Link from "next/link";

import {
  Card,
  EmptyState,
  Pagination,
  Pill,
  PlayerImage,
  ManagerAvatar,
  SectionHeader,
  StatTile,
} from "@/components/ui";
import { LEAGUE_NAME } from "@/config/site";
import { getAllTrades, type ResolvedTrade } from "@/lib/data";

import { TRADES_PAGE_SIZE, tradesTotalPages } from "./pageSize";

export const dynamic = "force-static";

export const metadata = {
  title: `Trades · ${LEAGUE_NAME}`,
  description:
    "Every trade in league history, with one-click drill-in to historical fairness.",
};

interface PageProps {
  /**
   * The index route resolves this to `{}` and renders page 1. The paged route
   * at /transactions/trades/page/[page] renders this same component with an
   * explicit page number, which is why the prop is optional.
   *
   * Pagination is path-based, not query-based: under `force-static` Next
   * resolves searchParams to `{}` at build time, so `?page=N` silently served
   * page 1 for every N.
   */
  params?: Promise<{ page?: string }>;
}

/**
 * Renders one page of the trade log.
 *
 * Next.js rejects any export from a `page` file outside its known set, so this
 * component cannot be hoisted into a shared module without a third file. The
 * index route owns the markup and the paged route delegates to it.
 */
export default async function TradesPage({ params }: PageProps) {
  const requested = (await params)?.page;
  const page = Math.max(1, Number.parseInt(requested ?? "1", 10) || 1);

  const trades = await getAllTrades();
  const totalPages = tradesTotalPages(trades.length);
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * TRADES_PAGE_SIZE;
  const window = trades.slice(start, start + TRADES_PAGE_SIZE);

  const seasons = new Set(trades.map((t) => t.season));
  const biggest = [...trades].sort((a, b) => b.assetCount - a.assetCount)[0];
  const distinctParticipants = new Set(
    trades.flatMap((t) => t.sides.map((s) => s.manager.userId)),
  );

  return (
    <main className="relative">
      <section className="relative overflow-hidden border-b border-border">
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 pt-10 pb-10 sm:pt-14 sm:pb-12">
          <SectionHeader
            kicker={`${trades.length} trades · ${seasons.size} seasons`}
            title="Trades"
            description="Every deal the league has ever made. Tap any trade for the historical fairness breakdown."
            size="lg"
            actions={
              <Link
                href="/transactions"
                className="text-xs text-foreground-muted hover:text-accent transition-colors"
              >
                ← All transactions
              </Link>
            }
          />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatTile
          label="Trades"
          value={trades.length}
          accent="primary"
          subValue={`across ${seasons.size} seasons`}
        />
        <StatTile
          label="Active traders"
          value={distinctParticipants.size}
          accent="secondary"
          subValue="distinct managers"
        />
        {biggest ? (
          <StatTile
            label="Largest deal"
            value={biggest.assetCount}
            accent="primary"
            subValue={`${biggest.sides.length}-team trade · ${biggest.season}`}
          />
        ) : null}
      </section>

      <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-10 sm:mt-12 flex flex-col gap-4">
        {window.length === 0 ? (
          <EmptyState
            title="No trades on file yet"
            description="Once a deal goes through, it'll show here."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {window.map((t) => (
              <TradeRow key={t.transactionId} trade={t} />
            ))}
          </ul>
        )}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-2">
          <span className="text-[11px] tabular text-foreground-subtle">
            Showing {start + 1}–{Math.min(start + window.length, trades.length)} of{" "}
            {trades.length.toLocaleString("en-US")}
          </span>
          <Pagination
            page={safePage}
            totalPages={totalPages}
            hrefFor={(p) => (p === 1 ? "/transactions/trades" : `/transactions/trades/page/${p}`)}
          />
        </div>
      </section>
    </main>
  );
}

function TradeRow({ trade }: { trade: ResolvedTrade }) {
  return (
    <li>
      <Link
        href={`/transactions/trades/${trade.transactionId}`}
        className="block"
      >
        <Card variant="interactive" padding="md">
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <Pill tone="accent" size="sm">
                <ArrowRightLeft size={10} strokeWidth={2} className="-mt-0.5" />{" "}
                Trade
              </Pill>
              <span className="text-[11px] tabular text-foreground-subtle">
                {trade.season} · {formatDate(trade.statusUpdated)}
              </span>
              <span className="text-[10px] uppercase tracking-[0.18em] text-foreground-subtle">
                {trade.assetCount} assets
              </span>
            </div>
            <ArrowUpRight
              size={16}
              strokeWidth={1.5}
              className="text-foreground-subtle"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {trade.sides.map((s) => (
              <div
                key={s.rosterId}
                className="rounded-lg border border-border bg-surface px-3 py-2.5"
              >
                <div className="flex items-center gap-2 mb-2">
                  <ManagerAvatar manager={s.manager} size={24} ring="subtle" />
                  <span className="text-sm text-foreground truncate flex-1">
                    @{s.manager.username}
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.18em] text-foreground-subtle">
                    gets
                  </span>
                </div>
                <ul className="flex flex-col gap-1.5">
                  {s.players.map((p, i) => (
                    <li
                      key={`${p.playerId}-${i}`}
                      className="flex items-center gap-2"
                    >
                      <PlayerImage
                        playerId={p.playerId}
                        position={p.position}
                        name={p.name}
                        size={20}
                      />
                      <span className="text-[12px] text-foreground truncate flex-1">
                        {p.name}
                      </span>
                      <span className="text-[10px] text-foreground-subtle tabular">
                        {p.position}
                        {p.team ? ` · ${p.team}` : ""}
                      </span>
                    </li>
                  ))}
                  {s.picks.map((p, i) => (
                    <li
                      key={`pick-${i}`}
                      className="flex items-center gap-2 text-[12px] text-foreground-muted"
                    >
                      <span className="inline-block h-5 w-5 rounded-full bg-foreground/[0.04] flex items-center justify-center text-[9px] tabular text-foreground-subtle">
                        R{p.round}
                      </span>
                      <span>
                        {p.season} R{p.round}
                        {p.originalManager
                          ? ` · via @${p.originalManager.username}`
                          : ""}
                      </span>
                    </li>
                  ))}
                  {s.assetCount === 0 ? (
                    <li className="text-[11px] text-foreground-subtle">
                      — nothing
                    </li>
                  ) : null}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      </Link>
    </li>
  );
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
