import Link from "next/link";

import {
  Card,
  Kicker,
  ManagerAvatar,
  PlayerImage,
  ScatterPlot,
  SectionHeader,
  StackedBar,
  StatTile,
  type ScatterPoint,
  type StackedBarSegment,
} from "@/components/ui";
import { MetricExplainer } from "@/components/rankings/MetricExplainer";
import { RankingsCaveats } from "@/components/rankings/RankingsCaveats";
import { positionColor, trendColor } from "@/components/rankings/palette";
import { buildDynastyRankings } from "@/lib/rankings";
import type { RosterValueBreakdown, ValuedAsset } from "@/lib/rankings";

export const dynamic = "force-static";

const POSITION_ORDER = ["QB", "RB", "WR", "TE", "K", "DEF", "PICK"] as const;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  return sorted[mid] ?? 0;
}

export default async function DynastyRankingsPage() {
  const ranking = await buildDynastyRankings();
  const top = ranking.rosters[0];
  const median50 = median(ranking.rosters.map((r) => r.total));
  const totalLeagueValue = ranking.rosters.reduce((s, r) => s + r.total, 0);

  // Find biggest stud bonus (most top-heavy team)
  const studLeader = [...ranking.rosters].sort((a, b) => b.studBonus - a.studBonus)[0];
  // Find pick portfolio leader
  const pickLeader = [...ranking.rosters].sort((a, b) => b.pickValue - a.pickValue)[0];

  // Age vs. starter value scatter — one bubble per team.
  const scatterPoints: ScatterPoint[] = ranking.rosters
    .filter((r) => r.starterAvgAge !== null && r.starterAvgAge > 0)
    .map((r) => ({
      id: String(r.rosterId),
      x: r.starterAvgAge ?? 0,
      y: r.starterValue,
      r: 7,
      color: trendColor(r.trend30Day),
      label: r.manager.username,
    }));

  return (
    <>
      <section className="relative overflow-hidden border-b border-border">
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 pt-10 pb-10 sm:pt-14 sm:pb-12">
          <SectionHeader
            kicker={`Snapshot ${ranking.snapshotDate} · ${ranking.rosters.length} rosters · ${ranking.season} season`}
            title="Dynasty Power"
            description="Long-term roster value. Optimal starting lineup × 1.0, top-five bench × 0.5, the rest × 0.2, taxi × 0.4, picks × 1.0, plus a 15% kicker on every starter above 6,000."
            size="lg"
          />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-6">
        <MetricExplainer
          title="Dynasty Power"
          summary="A long-term roster grade. We weight every asset (player + pick) by how much it contributes to winning over the next several years, using FantasyCalc's trade-market values."
          bullets={[
            { term: "Starters × 1.0", def: "Optimal redraft lineup gets full value — the spots that score most." },
            { term: "Top-five bench × 0.5", def: "Useful depth or trade pieces, but not on the field." },
            { term: "Reserve × 0.2 / Taxi × 0.4", def: "Lottery tickets and developmental assets, valued conservatively." },
            { term: "Picks × 1.0 + 15% stud kicker", def: "Picks count full value; any starter above 6,000 earns a top-heavy bonus." },
          ]}
        />
      </section>

      <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile
          label="League average"
          value={ranking.leagueAverages.total}
          precision={0}
          accent="primary"
          subValue={`Total: ${(totalLeagueValue / 1000).toFixed(0)}k across ${ranking.rosters.length}`}
        />
        <StatTile
          label="Top dynasty value"
          value={top?.total ?? 0}
          precision={0}
          accent="secondary"
          subValue={top ? `@${top.manager.username}` : "—"}
        />
        <StatTile
          label="Most studs"
          value={studLeader?.studBonus ?? 0}
          precision={0}
          subValue={
            studLeader
              ? `@${studLeader.manager.username} · stud bonus`
              : "—"
          }
          animate={false}
        />
        <StatTile
          label="Pick warchest"
          value={pickLeader?.pickValue ?? 0}
          precision={0}
          subValue={pickLeader ? `@${pickLeader.manager.username}` : "—"}
        />
      </section>

      {/* Main ranked table */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-8 sm:mt-10 flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <Kicker>The Ranking</Kicker>
          <span className="text-[11px] tabular text-foreground-subtle uppercase tracking-[0.06em]">
            league median {median50.toFixed(0)}
          </span>
        </div>
        <ol className="border-y border-rule">
          {ranking.rosters.map((row, i) => (
            <DynastyRow
              key={row.rosterId}
              row={row}
              rank={i + 1}
              leagueAverage={ranking.leagueAverages.total}
            />
          ))}
        </ol>
      </section>

      {/* Age scatter */}
      {scatterPoints.length > 0 ? (
        <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-12 sm:mt-16 flex flex-col gap-4">
          <SectionHeader
            kicker="Age × Starter Value"
            title="The Window"
            description="Younger and more valuable is better. Bubble color shows 30-day trend (green up, red down). Off-season trends are noisy."
            size="md"
          />
          <Card variant="default" padding="md">
            <ScatterPlot
              points={scatterPoints}
              width={780}
              height={420}
              xLabel="avg starter age"
              yLabel="starter value"
            />
          </Card>
        </section>
      ) : null}

      {/* Caveats */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-12 mb-16">
        <RankingsCaveats />
      </section>
    </>
  );
}

function DynastyRow({
  row,
  rank,
  leagueAverage,
}: {
  row: RosterValueBreakdown;
  rank: number;
  leagueAverage: number;
}) {
  const diff = row.total - leagueAverage;
  const diffPct = leagueAverage > 0 ? (diff / leagueAverage) * 100 : 0;
  const isTopThree = rank <= 3;

  // Position breakdown segments
  const segments: StackedBarSegment[] = POSITION_ORDER.map((pos) => ({
    key: pos,
    value: row.byPosition[pos] ?? 0,
    color: positionColor(pos),
    label: pos,
  })).filter((s) => s.value > 0);

  // Top 3 studs (by raw value among starters)
  const studs = [...row.starters]
    .sort((a, b) => b.asset.value - a.asset.value)
    .slice(0, 3)
    .map((s) => s.asset);

  return (
    <Card variant="row" as="li" className="flex flex-col gap-3">
      <div className="grid grid-cols-12 gap-3 sm:gap-4 items-center">
        {/* Rank + manager */}
        <div className="col-span-12 sm:col-span-5 flex items-center gap-3 min-w-0">
          <span
            className={
              isTopThree
                ? "font-display text-3xl text-accent tabular leading-none w-9 text-center shrink-0"
                : "font-display text-3xl text-foreground-subtle tabular leading-none w-9 text-center shrink-0"
            }
            aria-label={`Rank ${rank}`}
          >
            {rank.toString().padStart(2, "0")}
          </span>
          <Link
            href={`/managers/${row.manager.username}`}
            className="flex items-center gap-3 group min-w-0"
            style={{ viewTransitionName: `manager-card-${row.manager.userId}` }}
          >
            <ManagerAvatar manager={row.manager} size={36} ring="subtle" />
            <span className="flex flex-col min-w-0">
              <span className="font-display text-xl sm:text-2xl text-foreground leading-tight group-hover:text-accent transition-colors truncate">
                {row.manager.displayName}
              </span>
              <span className="text-[11px] text-foreground-subtle truncate tabular">
                @{row.manager.username}
              </span>
            </span>
          </Link>
        </div>

        {/* Total + diff */}
        <div className="col-span-7 sm:col-span-3 flex flex-col gap-1 min-w-0">
          <span className="font-display text-2xl sm:text-3xl text-foreground tabular leading-none">
            {row.total.toLocaleString("en-US", { maximumFractionDigits: 0 })}
          </span>
          <span
            className={
              diff >= 0
                ? "text-[11px] tabular text-positive"
                : "text-[11px] tabular text-negative"
            }
          >
            {diff >= 0 ? "▲ +" : "▼ −"}
            {Math.abs(diffPct).toFixed(1)}% vs avg
          </span>
        </div>

        {/* Position breakdown bar */}
        <div className="col-span-5 sm:col-span-4 min-w-0">
          {segments.length > 0 ? (
            <StackedBar segments={segments} height={10} />
          ) : null}
        </div>
      </div>

      {/* Tap-to-reveal: stud breakdown */}
      <details className="group/details">
        <summary className="list-none cursor-pointer flex items-center justify-between gap-2 text-[11px] tabular text-foreground-subtle uppercase tracking-[0.06em] hover:text-foreground transition-colors">
          <span className="flex items-center gap-3">
            <span>Top studs</span>
            <span className="hidden sm:inline">
              starter {row.starterValue.toLocaleString("en-US", { maximumFractionDigits: 0 })} ·
              picks {row.pickValue.toLocaleString("en-US", { maximumFractionDigits: 0 })} ·
              bench {row.benchValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}
            </span>
          </span>
          <span className="text-foreground-subtle group-open/details:rotate-180 transition-transform">▾</span>
        </summary>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 pt-3 border-t border-rule">
          {studs.map((asset) => (
            <StudCell key={asset.assetId} asset={asset} />
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-6 gap-x-3 gap-y-1.5">
          <Tally label="Starter" value={row.starterValue} accent />
          <Tally label="Picks" value={row.pickValue} />
          <Tally label="Bench (×0.5)" value={row.benchValue} />
          <Tally label="Reserve (×0.2)" value={row.reserveValue} />
          <Tally label="Taxi (×0.4)" value={row.taxiValue} />
          <Tally label="Stud +" value={row.studBonus} />
        </div>
      </details>
    </Card>
  );
}

function Tally({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 min-w-0">
      <span className="text-[10px] uppercase tracking-[0.16em] text-foreground-subtle truncate">
        {label}
      </span>
      <span
        className={
          accent
            ? "tabular text-foreground font-medium"
            : "tabular text-foreground-muted"
        }
      >
        {value.toLocaleString("en-US", { maximumFractionDigits: 0 })}
      </span>
    </div>
  );
}

function StudCell({ asset }: { asset: ValuedAsset }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <PlayerImage
        playerId={asset.assetId}
        position={asset.position}
        name={asset.name}
        size={24}
        fallbackColor={positionColor(asset.position)}
      />
      <span className="text-sm text-foreground truncate">{asset.name}</span>
      <span className="text-xs text-foreground-subtle tabular ml-auto shrink-0">
        {asset.value.toLocaleString("en-US", { maximumFractionDigits: 0 })}
      </span>
    </div>
  );
}
