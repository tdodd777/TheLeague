import { Star } from "lucide-react";

import { cn } from "@/lib/cn";
import {
  Card,
  Kicker,
  Pill,
  PlayerImage,
  SectionHeader,
  StackedBar,
  StatTile,
  type StackedBarSegment,
} from "@/components/ui";
import { positionColor, formatPickLabel, trendColor } from "./palette";
import type { RosterValueBreakdown, ValuedAsset } from "@/lib/rankings";

interface RosterValueSectionProps {
  breakdown: RosterValueBreakdown;
  /** Rank in the dynasty league standings (1-based). */
  rank: number;
  /** League-average dynasty value. */
  leagueAverage: number;
  /** Snapshot date label. */
  snapshotDate: string;
  className?: string;
}

const POSITION_ORDER = ["QB", "RB", "WR", "TE", "K", "DEF", "PICK"] as const;

export function RosterValueSection({
  breakdown,
  rank,
  leagueAverage,
  snapshotDate,
  className,
}: RosterValueSectionProps) {
  const diff = breakdown.total - leagueAverage;
  const diffPct = leagueAverage > 0 ? (diff / leagueAverage) * 100 : 0;

  const positionSegments: StackedBarSegment[] = POSITION_ORDER.map((pos) => ({
    key: pos,
    value: breakdown.byPosition[pos] ?? 0,
    color: positionColor(pos),
    label: pos,
  })).filter((s) => s.value > 0);

  const studs = [...breakdown.starters]
    .sort((a, b) => b.asset.value - a.asset.value)
    .slice(0, 5);

  return (
    <section
      className={cn(
        "mx-auto max-w-6xl px-4 sm:px-6 mt-12 sm:mt-16 flex flex-col gap-5",
        className,
      )}
    >
      <SectionHeader
        kicker={`Dynasty value · snapshot ${snapshotDate} · ranked #${rank}`}
        title="Roster Value"
        description="Optimal lineup × 1.0, top-five bench × 0.5, the rest × 0.2, taxi × 0.4, picks × 1.0, plus a 15% kicker on every starter above 6,000."
        size="md"
      />

      {/* Headline stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile
          label="Total dynasty value"
          value={breakdown.total}
          precision={0}
          accent="primary"
          subValue={
            <span className={diff >= 0 ? "text-positive" : "text-negative"}>
              {diff >= 0 ? "+" : "−"}
              {Math.abs(diff).toLocaleString("en-US", {
                maximumFractionDigits: 0,
              })}{" "}
              ({diff >= 0 ? "+" : "−"}
              {Math.abs(diffPct).toFixed(1)}%) vs avg
            </span>
          }
        />
        <StatTile
          label="Starters"
          value={breakdown.starterValue}
          precision={0}
          accent="secondary"
          subValue={`${breakdown.starters.length} on the field`}
        />
        <StatTile
          label="Picks"
          value={breakdown.pickValue}
          precision={0}
          subValue={`${breakdown.picks.length} owned`}
        />
        <StatTile
          label="Avg starter age"
          value={
            breakdown.starterAvgAge !== null
              ? breakdown.starterAvgAge.toFixed(1)
              : "—"
          }
          subValue={
            breakdown.rosterAvgAge !== null
              ? `roster avg ${breakdown.rosterAvgAge.toFixed(1)}`
              : "—"
          }
          animate={false}
        />
      </div>

      {/* Position breakdown bar */}
      {positionSegments.length > 0 ? (
        <Card variant="default" padding="md">
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <Kicker>Position breakdown</Kicker>
            <span className="text-[10px] uppercase tracking-[0.18em] text-foreground-subtle">
              by raw value across the entire roster
            </span>
          </div>
          <StackedBar segments={positionSegments} height={16} showInline />
        </Card>
      ) : null}

      {/* Tier breakdown */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <TierTile
          label="Starter ×1.0"
          value={breakdown.starterValue}
          accent
        />
        <TierTile label="Bench ×0.5" value={breakdown.benchValue} />
        <TierTile label="Reserve ×0.2" value={breakdown.reserveValue} />
        <TierTile label="Taxi ×0.4" value={breakdown.taxiValue} />
        <TierTile label="Stud bonus" value={breakdown.studBonus} />
      </div>

      {/* Two-column: starting lineup + studs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card variant="default" padding="md">
          <div className="flex items-baseline justify-between mb-3">
            <Kicker>Optimal lineup</Kicker>
            <Pill tone="accent" size="sm">
              {breakdown.starterValue.toLocaleString("en-US", {
                maximumFractionDigits: 0,
              })}
            </Pill>
          </div>
          <ul className="flex flex-col">
            {breakdown.starters.map((s) => (
              <PlayerRow key={s.asset.assetId} asset={s.asset} slot={s.slot} />
            ))}
          </ul>
        </Card>

        <Card variant="default" padding="md">
          <div className="flex items-baseline justify-between mb-3">
            <div className="flex items-center gap-2">
              <Star
                size={11}
                strokeWidth={2}
                fill="currentColor"
                className="text-accent"
              />
              <Kicker>Studs</Kicker>
            </div>
            <span className="text-[10px] uppercase tracking-[0.18em] text-foreground-subtle">
              top 5 by value
            </span>
          </div>
          <ul className="flex flex-col">
            {studs.map((s) => (
              <PlayerRow
                key={s.asset.assetId}
                asset={s.asset}
                slot={s.slot}
                emphasized
              />
            ))}
          </ul>
        </Card>
      </div>

      {/* Depth chart */}
      <DepthChart breakdown={breakdown} />

      {/* Pick portfolio */}
      {breakdown.picks.length > 0 ? (
        <Card variant="default" padding="md">
          <div className="flex items-baseline justify-between mb-3">
            <Kicker>Pick portfolio</Kicker>
            <Pill tone="accent" size="sm">
              {breakdown.pickValue.toLocaleString("en-US", {
                maximumFractionDigits: 0,
              })}{" "}
              total
            </Pill>
          </div>
          <ul className="flex flex-col">
            {breakdown.picks.map((p) => (
              <PickRow key={p.assetId} asset={p} />
            ))}
          </ul>
        </Card>
      ) : null}
    </section>
  );
}

function TierTile({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-lg border border-border px-3 py-2.5",
        accent ? "bg-accent-soft/40" : "bg-surface",
      )}
    >
      <span className="text-[10px] uppercase tracking-[0.16em] text-foreground-subtle font-medium">
        {label}
      </span>
      <span className="text-lg font-medium tabular leading-none text-foreground">
        {value.toLocaleString("en-US", { maximumFractionDigits: 0 })}
      </span>
    </div>
  );
}

function PlayerRow({
  asset,
  slot,
  emphasized = false,
}: {
  asset: ValuedAsset;
  slot?: string;
  emphasized?: boolean;
}) {
  return (
    <li className="flex items-center gap-2.5 py-1.5 border-b border-border/50 last:border-b-0">
      {slot ? (
        <span className="text-[10px] uppercase tracking-[0.18em] text-foreground-subtle font-medium tabular w-10 shrink-0">
          {slot}
        </span>
      ) : null}
      <PlayerImage
        playerId={asset.assetId}
        position={asset.position}
        name={asset.name}
        size={28}
        fallbackColor={positionColor(asset.position)}
      />
      <span className="flex flex-col min-w-0 flex-1">
        <span
          className={cn(
            "text-sm truncate",
            emphasized ? "text-foreground font-medium" : "text-foreground",
          )}
        >
          {asset.name}
          {asset.missing ? (
            <span className="ml-2 text-[10px] text-foreground-subtle italic">
              not in snapshot
            </span>
          ) : null}
        </span>
        <span className="text-[11px] text-foreground-subtle tabular truncate">
          {asset.team ?? "FA"}
          {asset.age !== null ? ` · age ${asset.age.toFixed(1)}` : ""}
          {asset.positionRank !== null
            ? ` · ${asset.position}${asset.positionRank}`
            : ""}
        </span>
      </span>
      <span className="text-xs tabular text-foreground-muted shrink-0">
        {asset.value.toLocaleString("en-US", { maximumFractionDigits: 0 })}
      </span>
      {asset.trend30Day !== 0 ? (
        <span
          className="text-[10px] tabular shrink-0 w-12 text-right"
          style={{ color: trendColor(asset.trend30Day) }}
        >
          {asset.trend30Day >= 0 ? "+" : "−"}
          {Math.abs(asset.trend30Day).toLocaleString("en-US", {
            maximumFractionDigits: 0,
          })}
        </span>
      ) : (
        <span className="w-12 shrink-0" />
      )}
    </li>
  );
}

function PickRow({ asset }: { asset: ValuedAsset }) {
  const label =
    asset.pickSeason !== undefined && asset.pickRound !== undefined
      ? formatPickLabel(asset.pickSeason, asset.pickRound, asset.pickSlot ?? null)
      : asset.name;
  return (
    <li className="flex items-center gap-2 py-1.5 border-b border-border/50 last:border-b-0">
      <span
        className="inline-block h-1.5 w-1.5 rounded-full shrink-0"
        style={{ background: positionColor("PICK") }}
        aria-hidden
      />
      <span className="flex flex-col min-w-0 flex-1">
        <span className="text-sm text-foreground tabular">{label}</span>
        <span className="text-[11px] text-foreground-subtle tabular truncate">
          {asset.name}
          {asset.pickSource === "round_fallback"
            ? " · round-only fallback (mid)"
            : ""}
          {asset.pickSource === "missing" ? " · not in snapshot" : ""}
        </span>
      </span>
      <span className="text-xs tabular text-foreground-muted shrink-0">
        {asset.value.toLocaleString("en-US", { maximumFractionDigits: 0 })}
      </span>
    </li>
  );
}

function DepthChart({ breakdown }: { breakdown: RosterValueBreakdown }) {
  // Group all roster assets (excluding picks) by position.
  const groups = new Map<string, ValuedAsset[]>();
  function add(assets: ValuedAsset[], _tier: "starter" | "bench" | "reserve" | "taxi") {
    void _tier;
    for (const a of assets) {
      const arr = groups.get(a.position) ?? [];
      arr.push(a);
      groups.set(a.position, arr);
    }
  }
  add(
    breakdown.starters.map((s) => s.asset),
    "starter",
  );
  add(breakdown.bench, "bench");
  add(breakdown.reserve, "reserve");
  add(breakdown.taxi, "taxi");

  const orderedPositions = ["QB", "RB", "WR", "TE", "K", "DEF"] as const;

  // Find which IDs are starters / taxi / bench for tagging.
  const starterIds = new Set(breakdown.starters.map((s) => s.asset.assetId));
  const taxiIds = new Set(breakdown.taxi.map((a) => a.assetId));
  const reserveIds = new Set(breakdown.reserve.map((a) => a.assetId));
  const benchIds = new Set(breakdown.bench.map((a) => a.assetId));

  return (
    <Card variant="default" padding="md">
      <div className="flex items-baseline justify-between mb-3">
        <Kicker>Depth chart</Kicker>
        <span className="text-[10px] uppercase tracking-[0.18em] text-foreground-subtle">
          starter → bench → reserve → taxi
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {orderedPositions.map((pos) => {
          const list = (groups.get(pos) ?? []).sort(
            (a, b) => b.value - a.value,
          );
          if (list.length === 0) return null;
          return (
            <div key={pos} className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: positionColor(pos) }}
                  aria-hidden
                />
                <span className="text-sm font-medium text-foreground">
                  {pos}
                </span>
                <span className="text-[10px] text-foreground-subtle tabular ml-auto">
                  {list.length}
                </span>
              </div>
              <ul className="flex flex-col">
                {list.map((a) => {
                  const isStarter = starterIds.has(a.assetId);
                  const isTaxi = taxiIds.has(a.assetId);
                  const isReserve = reserveIds.has(a.assetId);
                  const isBench = benchIds.has(a.assetId);
                  return (
                    <li
                      key={a.assetId}
                      className="flex items-center gap-2 py-1 border-b border-border/40 last:border-b-0"
                    >
                      {isStarter ? (
                        <Star
                          size={10}
                          strokeWidth={2}
                          fill="currentColor"
                          className="text-accent shrink-0"
                        />
                      ) : (
                        <span className="w-[10px] shrink-0" />
                      )}
                      <PlayerImage
                        playerId={a.assetId}
                        position={a.position}
                        name={a.name}
                        size={20}
                        fallbackColor={positionColor(a.position)}
                      />
                      <span className="text-xs text-foreground truncate flex-1">
                        {a.name}
                      </span>
                      {isTaxi ? <Pill tone="secondary" size="sm">T</Pill> : null}
                      {isReserve ? <Pill tone="warning" size="sm">IR</Pill> : null}
                      {isBench && !isStarter && !isTaxi && !isReserve ? (
                        <span className="text-[9px] uppercase tracking-[0.14em] text-foreground-subtle">
                          bn
                        </span>
                      ) : null}
                      <span className="text-[11px] tabular text-foreground-subtle shrink-0 w-12 text-right">
                        {a.value.toLocaleString("en-US", {
                          maximumFractionDigits: 0,
                        })}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
