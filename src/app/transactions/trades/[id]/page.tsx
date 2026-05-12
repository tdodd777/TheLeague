import { ArrowRightLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  Card,
  Kicker,
  ManagerAvatar,
  Pill,
  PlayerImage,
  SectionHeader,
  StackedBar,
  StatTile,
  type StackedBarSegment,
} from "@/components/ui";
import {
  getAllTrades,
  readPlayers,
  resolveDraftedPicks,
  type DraftedPickResolution,
  type TradeSide,
} from "@/lib/data";
import {
  buildPickAsset,
  buildPlayerAsset,
  getSnapshotClosestTo,
  resolveSnapshot,
  type ResolvedSnapshot,
} from "@/lib/rankings";
import type { ValuedAsset } from "@/lib/rankings";

export const dynamic = "force-static";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateStaticParams() {
  const trades = await getAllTrades();
  return trades.map((t) => ({ id: t.transactionId }));
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  return {
    title: `Trade · ${id}`,
    description: "Historical fairness for a league trade.",
  };
}

interface SideValuation {
  side: TradeSide;
  assets: ValuedAsset[];
  total: number;
}

export default async function TradeDetailPage({ params }: PageProps) {
  const { id } = await params;
  const all = await getAllTrades();
  const trade = all.find((t) => t.transactionId === id);
  if (!trade) notFound();

  const players = await readPlayers();
  const { date: snapshotDate, snapshot } = await getSnapshotClosestTo(
    trade.statusUpdated,
  );
  // Dynasty values are the right unit for a trade involving picks. Redraft
  // wouldn't price future-year picks at all.
  const resolved = resolveSnapshot(snapshot, "dynasty");

  // For any pick season referenced, load the drafted-pick map. Picks whose
  // draft is complete will resolve to the player picked (real value); future
  // picks fall back to the snapshot's pick entries.
  const seasonsNeeded = new Set<string>();
  for (const side of trade.sides) for (const p of side.picks) seasonsNeeded.add(p.season);
  const draftedBySeason = new Map<string, Map<string, DraftedPickResolution>>();
  await Promise.all(
    [...seasonsNeeded].map(async (s) => {
      draftedBySeason.set(s, await resolveDraftedPicks(s));
    }),
  );

  const valuations: SideValuation[] = trade.sides.map((side) =>
    valueSide(side, resolved, players, draftedBySeason),
  );

  const totalAcrossSides = valuations.reduce((s, v) => s + v.total, 0);
  const winnerIdx = valuations.reduce(
    (best, cur, i) => (cur.total > valuations[best]!.total ? i : best),
    0,
  );
  const winner = valuations[winnerIdx]!;
  const loser =
    valuations.length === 2
      ? valuations[1 - winnerIdx]!
      : null;
  const delta =
    loser && loser.total > 0
      ? ((winner.total - loser.total) / loser.total) * 100
      : null;

  return (
    <main className="relative">
      <section className="relative overflow-hidden border-b border-border">
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 pt-10 pb-10 sm:pt-14 sm:pb-12">
          <SectionHeader
            kicker={`${trade.season} · ${formatDate(trade.statusUpdated)}`}
            title="Trade Detail"
            description={
              <>
                Valued against the FantasyCalc dynasty snapshot from{" "}
                <span className="text-foreground-muted tabular">{snapshotDate}</span>
                {" — the closest-in-time snapshot to this trade."}
              </>
            }
            size="lg"
            actions={
              <Link
                href="/transactions/trades"
                className="text-xs text-foreground-muted hover:text-accent transition-colors"
              >
                ← All trades
              </Link>
            }
          />
        </div>
      </section>

      {/* WIN BAR */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-8">
        <Card variant="default" padding="lg">
          <div className="flex items-baseline justify-between mb-4">
            <Kicker>
              <ArrowRightLeft
                className="inline-block mr-1.5 mb-0.5"
                size={11}
                strokeWidth={2}
              />
              Win Bar
            </Kicker>
            <span className="text-[11px] tabular text-foreground-subtle">
              {totalAcrossSides.toLocaleString("en-US")} pts of value swapped
            </span>
          </div>
          <StackedBar
            segments={valuations.map((v, i) => ({
              key: v.side.manager.userId,
              value: v.total,
              color:
                i === winnerIdx
                  ? "var(--accent-primary)"
                  : "var(--accent-secondary)",
              label: `@${v.side.manager.username} · ${Math.round(v.total).toLocaleString()}`,
            }))}
            height={22}
            showInline
            ariaLabel="Trade fairness win bar"
          />
          <div className="mt-3 flex items-center gap-2 text-xs text-foreground-muted tabular">
            {valuations.length === 2 && delta !== null ? (
              <>
                <Pill tone={delta > 25 ? "accent" : "neutral"} size="sm">
                  +{delta.toFixed(1)}% edge
                </Pill>
                <span>
                  to{" "}
                  <Link
                    href={`/managers/${winner.side.manager.username}`}
                    className="text-foreground hover:text-accent transition-colors"
                  >
                    @{winner.side.manager.username}
                  </Link>{" "}
                  over @{loser!.side.manager.username}
                </span>
              </>
            ) : (
              <span>Multi-team deal — values shown per side.</span>
            )}
          </div>
        </Card>
      </section>

      {/* PER-SIDE TILES */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {valuations.map((v) => (
          <StatTile
            key={v.side.manager.userId}
            label={`@${v.side.manager.username} value`}
            value={Math.round(v.total)}
            subValue={`${v.side.players.length} player${v.side.players.length === 1 ? "" : "s"} · ${v.side.picks.length} pick${v.side.picks.length === 1 ? "" : "s"}`}
            accent={
              v === winner ? "primary" : valuations.length > 2 ? null : "secondary"
            }
          />
        ))}
      </section>

      {/* SIDE-BY-SIDE BREAKDOWN */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-8 sm:mt-10 grid grid-cols-1 md:grid-cols-2 gap-4">
        {valuations.map((v, i) => (
          <SideCard
            key={v.side.manager.userId}
            valuation={v}
            isWinner={i === winnerIdx && valuations.length === 2}
            referenceTotal={
              valuations.length === 2
                ? valuations[1 - i]!.total
                : null
            }
          />
        ))}
      </section>

      {/* RAW METADATA */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-10 mb-12">
        <Card variant="default" padding="md">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px] tabular text-foreground-subtle">
            <span>
              <span className="block text-foreground-muted">Transaction</span>
              {trade.transactionId}
            </span>
            <span>
              <span className="block text-foreground-muted">Status</span>
              {trade.status}
            </span>
            <span>
              <span className="block text-foreground-muted">Created</span>
              {formatDate(trade.created)}
            </span>
            <span>
              <span className="block text-foreground-muted">Snapshot used</span>
              {snapshotDate}
            </span>
          </div>
        </Card>
      </section>
    </main>
  );
}

function valueSide(
  side: TradeSide,
  resolved: ResolvedSnapshot,
  players: Parameters<typeof buildPlayerAsset>[2],
  draftedBySeason: Map<string, Map<string, DraftedPickResolution>>,
): SideValuation {
  const playerAssets: ValuedAsset[] = side.players.map((p) =>
    buildPlayerAsset(p.playerId, resolved, players),
  );
  const pickAssets: ValuedAsset[] = side.picks.map((p) => {
    const drafted = draftedBySeason
      .get(p.season)
      ?.get(`${p.round}.${p.originalRosterId}`);
    if (drafted) {
      // Pick already drafted: value the player it became, using the same
      // snapshot. Mark as a pick so the UI shows R{round} → {player}.
      const playerAsset = buildPlayerAsset(drafted.playerId, resolved, players);
      return {
        ...playerAsset,
        position: "PICK",
        pickSeason: Number(p.season),
        pickRound: p.round,
        pickSlot: drafted.draftSlot,
        pickSource: "drafted_player",
        becamePlayer: {
          playerId: drafted.playerId,
          name: drafted.playerName,
          position: drafted.position,
          pickNo: drafted.pickNo,
          draftSlot: drafted.draftSlot,
        },
      };
    }
    // Pick not yet drafted (future year): fall back to the snapshot lookup,
    // which uses the round-only fantasy calc entry via withDefaultSlot.
    return buildPickAsset(
      { season: Number(p.season), round: p.round, slot: null },
      resolved,
    );
  });
  const total =
    playerAssets.reduce((s, a) => s + a.value, 0) +
    pickAssets.reduce((s, a) => s + a.value, 0);
  return { side, assets: [...playerAssets, ...pickAssets], total };
}

function SideCard({
  valuation,
  isWinner,
  referenceTotal,
}: {
  valuation: SideValuation;
  isWinner: boolean;
  referenceTotal: number | null;
}) {
  const segments: StackedBarSegment[] = valuation.assets
    .filter((a) => a.value > 0)
    .map((a) => ({
      key: a.assetId,
      value: a.value,
      color:
        a.position === "PICK"
          ? "var(--accent-secondary)"
          : "var(--accent-primary)",
      label: a.name,
    }));

  return (
    <Card variant="default" padding="lg">
      <div className="flex items-center gap-3 mb-4">
        <ManagerAvatar
          manager={valuation.side.manager}
          size={40}
          ring={isWinner ? "gradient" : "subtle"}
        />
        <div className="flex flex-col min-w-0 flex-1">
          <Link
            href={`/managers/${valuation.side.manager.username}`}
            className="text-sm font-medium text-foreground hover:text-accent transition-colors truncate"
          >
            {valuation.side.manager.displayName}
          </Link>
          <span className="text-xs text-foreground-subtle truncate">
            @{valuation.side.manager.username}
          </span>
        </div>
        {isWinner ? (
          <Pill tone="accent" size="sm">
            edge
          </Pill>
        ) : null}
      </div>
      <div className="flex flex-col gap-2 mb-4">
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] uppercase tracking-[0.18em] text-foreground-subtle">
            Total received
          </span>
          {referenceTotal !== null && referenceTotal > 0 ? (
            <span className="text-[10px] tabular text-foreground-subtle">
              {valuation.total > referenceTotal ? "+" : ""}
              {(((valuation.total - referenceTotal) / referenceTotal) * 100).toFixed(1)}% vs other side
            </span>
          ) : null}
        </div>
        <div className="flex items-baseline gap-2">
          <span className="font-display text-4xl text-foreground tabular leading-none">
            {Math.round(valuation.total).toLocaleString()}
          </span>
          <span className="text-xs text-foreground-muted">value pts</span>
        </div>
        {segments.length > 0 ? (
          <div className="mt-2">
            <StackedBar segments={segments} showLegend={false} height={6} />
          </div>
        ) : null}
      </div>
      <ul className="flex flex-col">
        {valuation.assets.map((a) => {
          const becamePlayer = a.becamePlayer ?? null;
          const headline = becamePlayer
            ? `${a.pickSeason} R${a.pickRound}.${String(a.pickSlot ?? 0).padStart(2, "0")} → ${becamePlayer.name}`
            : a.name;
          const subline = becamePlayer
            ? `Pick · ${becamePlayer.position}`
            : `${a.position}${a.team ? ` · ${a.team}` : ""}${a.missing ? " · not in snapshot" : ""}`;
          return (
            <li
              key={a.assetId}
              className="flex items-center gap-2.5 py-2 border-b border-border/50 last:border-b-0"
            >
              {a.position === "PICK" && !becamePlayer ? (
                <span className="inline-block h-7 w-7 rounded-full bg-foreground/[0.04] flex items-center justify-center text-[9px] tabular text-foreground-subtle">
                  R{a.pickRound ?? "?"}
                </span>
              ) : becamePlayer ? (
                <PlayerImage
                  playerId={becamePlayer.playerId}
                  position={becamePlayer.position}
                  name={becamePlayer.name}
                  size={28}
                />
              ) : (
                <PlayerImage
                  playerId={a.assetId}
                  position={a.position}
                  name={a.name}
                  size={28}
                />
              )}
              <span className="flex flex-col min-w-0 flex-1">
                <span className="text-sm text-foreground truncate">{headline}</span>
                <span className="text-[11px] text-foreground-subtle tabular truncate">
                  {subline}
                </span>
              </span>
              <span className="text-sm tabular text-foreground">
                {Math.round(a.value).toLocaleString()}
              </span>
            </li>
          );
        })}
        {valuation.assets.length === 0 ? (
          <li className="py-3 text-[11px] text-foreground-subtle">
            No assets received.
          </li>
        ) : null}
      </ul>
    </Card>
  );
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
