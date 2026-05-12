import { ArrowRightLeft, ArrowUpRight } from "lucide-react";
import Link from "next/link";

import {
  Card,
  EmptyState,
  ManagerAvatar,
  Pagination,
  Pill,
  PlayerImage,
  SectionHeader,
  StatTile,
} from "@/components/ui";
import { LEAGUE_NAME } from "@/config/site";
import {
  findManagerByUsername,
  getManagerTradeStats,
  getManagerTransactionStats,
  getTransactionsFeed,
  type FeedTransaction,
  type FeedTxType,
} from "@/lib/data";

import { ManagerFilterDropdown, type ManagerOption } from "./ManagerFilterDropdown";

export const metadata = {
  title: `Transactions · ${LEAGUE_NAME}`,
  description:
    "Every trade, waiver claim, and free-agent move across the league's history.",
};

const PAGE_SIZE = 10;

const FILTERS: Array<{ value: "all" | FeedTxType; label: string }> = [
  { value: "all", label: "All" },
  { value: "trade", label: "Trades" },
  { value: "waiver", label: "Waivers" },
  { value: "free_agent", label: "Free Agents" },
];

interface PageProps {
  searchParams: Promise<{ page?: string; type?: string; manager?: string }>;
}

export default async function TransactionsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const requestedType = sp.type;
  const filter: "all" | FeedTxType =
    requestedType === "trade" ||
    requestedType === "waiver" ||
    requestedType === "free_agent"
      ? requestedType
      : "all";
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const requestedManager = sp.manager?.trim() || null;

  const all = await getTransactionsFeed();

  // Resolve manager username → userId. Use `null` if not found.
  const managerLookup = requestedManager
    ? await findManagerByUsername(requestedManager)
    : null;
  const managerUserId = managerLookup?.manager.userId ?? null;
  const selectedManager = managerLookup?.manager ?? null;

  const byManager =
    managerUserId === null
      ? all
      : all.filter((t) =>
          t.parties.some((p) => p.manager.userId === managerUserId),
        );

  const filtered =
    filter === "all" ? byManager : byManager.filter((t) => t.type === filter);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const window = filtered.slice(start, start + PAGE_SIZE);

  const seasonsRepresented = new Set(byManager.map((t) => t.season));

  // Manager filter dropdown options: distinct managers across the feed.
  const managerOptions = collectManagerOptions(all);

  return (
    <main className="relative">
      <section className="relative overflow-hidden border-b border-border">
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 pt-10 pb-10 sm:pt-14 sm:pb-12">
          <SectionHeader
            kicker={`${byManager.length.toLocaleString("en-US")} transactions · ${seasonsRepresented.size} seasons`}
            title={
              selectedManager
                ? `Transactions · @${selectedManager.username}`
                : "Transactions"
            }
            description={
              selectedManager
                ? `Every move @${selectedManager.username} has made — trades, waivers, free agents.`
                : "Every trade, waiver, and free-agent move. Filter by type, paginate through the receipts."
            }
            size="lg"
          />
        </div>
      </section>

      {managerUserId ? (
        <ManagerStatStrip userId={managerUserId} />
      ) : (
        <GlobalStatStrip
          all={all}
          seasons={seasonsRepresented.size}
        />
      )}

      <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-10 sm:mt-12 flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-1 self-start">
              {FILTERS.map((f) => {
                const active = filter === f.value;
                return (
                  <Link
                    key={f.value}
                    href={buildHref(1, f.value, requestedManager)}
                    scroll={false}
                    className={
                      active
                        ? "px-3 py-1 rounded-md bg-foreground/[0.06] text-foreground text-xs font-medium"
                        : "px-3 py-1 rounded-md text-foreground-muted hover:text-foreground hover:bg-foreground/[0.03] text-xs transition-colors"
                    }
                  >
                    {f.label}
                  </Link>
                );
              })}
            </div>

            <ManagerFilterDropdown
              options={managerOptions}
              selected={requestedManager}
              type={filter}
            />
          </div>

          <Link
            href="/transactions/trades"
            className="text-xs text-foreground-muted hover:text-accent transition-colors flex items-center gap-1 self-start sm:self-auto"
          >
            <ArrowRightLeft size={12} strokeWidth={1.75} />
            Trades-only feed →
          </Link>
        </div>

        {window.length === 0 ? (
          <EmptyState
            title="No transactions match"
            description="Try a different filter or page."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {window.map((tx) => (
              <FeedItem key={tx.transactionId} tx={tx} />
            ))}
          </ul>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-2">
          <span className="text-[11px] tabular text-foreground-subtle">
            Showing {start + 1}–{Math.min(start + window.length, filtered.length)} of{" "}
            {filtered.length.toLocaleString("en-US")}
          </span>
          <Pagination
            page={safePage}
            totalPages={totalPages}
            hrefFor={(p) => buildHref(p, filter, requestedManager)}
            scroll={false}
          />
        </div>
      </section>
    </main>
  );
}

function buildHref(
  page: number,
  filter: "all" | FeedTxType,
  manager: string | null,
): string {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("type", filter);
  if (manager) params.set("manager", manager);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/transactions?${qs}` : "/transactions";
}

function collectManagerOptions(feed: FeedTransaction[]): ManagerOption[] {
  const map = new Map<string, ManagerOption>();
  for (const tx of feed) {
    for (const p of tx.parties) {
      const key = p.manager.username.toLowerCase();
      const cur = map.get(key);
      if (cur) {
        cur.count += 1;
      } else {
        map.set(key, {
          username: p.manager.username,
          displayName: p.manager.displayName,
          count: 1,
        });
      }
    }
  }
  return [...map.values()].sort((a, b) =>
    a.username.localeCompare(b.username),
  );
}

function GlobalStatStrip({
  all,
  seasons,
}: {
  all: FeedTransaction[];
  seasons: number;
}) {
  const tradesCount = all.filter((t) => t.type === "trade").length;
  const waiversCount = all.filter((t) => t.type === "waiver").length;
  const fasCount = all.filter((t) => t.type === "free_agent").length;
  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
      <StatTile
        label="Trades"
        value={tradesCount}
        accent="primary"
        subValue="completed deals"
      />
      <StatTile
        label="Waiver claims"
        value={waiversCount}
        accent="secondary"
        subValue="successful bids"
      />
      <StatTile
        label="Free-agent moves"
        value={fasCount}
        subValue="add/drop without bid"
      />
      <StatTile
        label="Seasons"
        value={seasons}
        subValue="contributing"
        animate={false}
      />
    </section>
  );
}

async function ManagerStatStrip({ userId }: { userId: string }) {
  const [tx, trade] = await Promise.all([
    getManagerTransactionStats(userId),
    getManagerTradeStats(userId),
  ]);
  const netPrefix = trade.netAssets > 0 ? "+" : "";
  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
      <StatTile
        label="Trades"
        value={tx.trades}
        accent="primary"
        subValue={`${trade.partners} partners`}
        animate={false}
      />
      <StatTile
        label="Net assets"
        value={`${netPrefix}${trade.netAssets}`}
        accent={trade.netAssets >= 0 ? "secondary" : "primary"}
        subValue={`${trade.playersReceived + trade.picksReceived} in · ${trade.playersGiven + trade.picksGiven} out`}
        animate={false}
      />
      <StatTile
        label="Waiver claims"
        value={tx.waivers}
        subValue="successful bids"
        animate={false}
      />
      <StatTile
        label="Free-agent moves"
        value={tx.freeAgents}
        subValue="add/drop without bid"
        animate={false}
      />
    </section>
  );
}

function FeedItem({ tx }: { tx: FeedTransaction }) {
  if (tx.type === "trade") return <TradeFeedItem tx={tx} />;
  return <SimpleFeedItem tx={tx} />;
}

function TradeFeedItem({ tx }: { tx: FeedTransaction }) {
  return (
    <li>
      <Link
        href={`/transactions/trades/${tx.transactionId}`}
        className="block"
      >
        <Card variant="interactive" padding="md">
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <Pill tone="accent" size="sm">
                <ArrowRightLeft
                  size={10}
                  strokeWidth={2}
                  className="-mt-0.5"
                />{" "}
                Trade
              </Pill>
              <span className="text-[11px] tabular text-foreground-subtle">
                {tx.season} · {formatDate(tx.statusUpdated)}
              </span>
            </div>
            <ArrowUpRight
              size={16}
              strokeWidth={1.5}
              className="text-foreground-subtle"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {tx.parties.map((p) => (
              <SidePanel key={p.rosterId} side={p} />
            ))}
          </div>
        </Card>
      </Link>
    </li>
  );
}

function SidePanel({
  side,
}: {
  side: FeedTransaction["parties"][number];
}) {
  const items = [
    ...side.adds.map((p) => ({ kind: "player" as const, player: p })),
    ...side.picksReceived.map((p) => ({ kind: "pick" as const, pick: p })),
  ];
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2.5">
      <div className="flex items-center gap-2 mb-2">
        <ManagerAvatar manager={side.manager} size={24} ring="subtle" />
        <span className="text-sm text-foreground truncate flex-1">
          @{side.manager.username}
        </span>
        <span className="text-[10px] uppercase tracking-[0.18em] text-foreground-subtle">
          gets
        </span>
      </div>
      {items.length === 0 ? (
        <span className="text-[11px] text-foreground-subtle">— nothing</span>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((it, i) =>
            it.kind === "player" ? (
              <li
                key={`${it.player.playerId}-${i}`}
                className="flex items-center gap-2"
              >
                <PlayerImage
                  playerId={it.player.playerId}
                  position={it.player.position}
                  name={it.player.name}
                  size={20}
                />
                <span className="text-[12px] text-foreground truncate">
                  {it.player.name}
                </span>
                <span className="text-[10px] text-foreground-subtle tabular">
                  {it.player.position}
                  {it.player.team ? ` · ${it.player.team}` : ""}
                </span>
              </li>
            ) : (
              <li
                key={`pick-${i}`}
                className="flex items-center gap-2 text-[12px] text-foreground-muted"
              >
                <span className="inline-block h-5 w-5 rounded-full bg-foreground/[0.04] flex items-center justify-center text-[9px] tabular text-foreground-subtle">
                  R{it.pick.round}
                </span>
                <span>
                  {it.pick.season} R{it.pick.round}
                  {it.pick.originalManager
                    ? ` · via @${it.pick.originalManager.username}`
                    : ""}
                </span>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}

function SimpleFeedItem({ tx }: { tx: FeedTransaction }) {
  const tone = tx.type === "waiver" ? "secondary" : "neutral";
  const label = tx.type === "waiver" ? "Waiver" : "Free Agent";
  // For non-trade, there's only a single party.
  const party = tx.parties[0];
  if (!party) return null;
  return (
    <li>
      <Card variant="default" padding="md">
        <div className="flex items-center gap-3 flex-wrap">
          <Pill tone={tone} size="sm">
            {label}
          </Pill>
          <span className="text-[11px] tabular text-foreground-subtle">
            {tx.season} · {formatDate(tx.statusUpdated)}
          </span>
          <Link
            href={`/managers/${party.manager.username}`}
            className="flex items-center gap-2 ml-auto"
          >
            <ManagerAvatar manager={party.manager} size={22} ring="subtle" />
            <span className="text-[12px] text-foreground hover:text-accent transition-colors">
              @{party.manager.username}
            </span>
          </Link>
        </div>
        <div className="mt-2.5 flex flex-col gap-1.5">
          {party.adds.map((p) => (
            <PlayerLine
              key={`add-${p.playerId}`}
              p={p}
              kind="add"
            />
          ))}
          {party.drops.map((p) => (
            <PlayerLine key={`drop-${p.playerId}`} p={p} kind="drop" />
          ))}
        </div>
      </Card>
    </li>
  );
}

function PlayerLine({
  p,
  kind,
}: {
  p: { playerId: string; name: string; position: string; team: string | null };
  kind: "add" | "drop";
}) {
  const sign = kind === "add" ? "+" : "−";
  const tone = kind === "add" ? "text-positive" : "text-negative";
  return (
    <div className="flex items-center gap-2 text-[12px]">
      <span className={`tabular w-3 ${tone}`}>{sign}</span>
      <PlayerImage
        playerId={p.playerId}
        position={p.position}
        name={p.name}
        size={18}
      />
      <span className="text-foreground truncate flex-1">{p.name}</span>
      <span className="text-[10px] text-foreground-subtle tabular">
        {p.position}
        {p.team ? ` · ${p.team}` : ""}
      </span>
    </div>
  );
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
