import { Snowflake, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";

import {
  Card,
  Kicker,
  ManagerAvatar,
  Pill,
  PlayerImage,
  SectionHeader,
  StatTile,
} from "@/components/ui";
import { MetricExplainer } from "@/components/rankings/MetricExplainer";
import { RankingsCaveats } from "@/components/rankings/RankingsCaveats";
import { positionColor, trendColor } from "@/components/rankings/palette";
import { buildDynastyRankings } from "@/lib/rankings";
import { isTrendSuppressed } from "@/lib/rankings/constants";
import type { RosterValueBreakdown, ValuedAsset } from "@/lib/rankings";

export const dynamic = "force-static";

interface ManagerTrend {
  manager: RosterValueBreakdown["manager"];
  rosterId: number;
  total30d: number;
  topGainers: ValuedAsset[];
  topLosers: ValuedAsset[];
}

function aggregateTrends(breakdown: RosterValueBreakdown): ManagerTrend {
  // Use the entire roster (active + reserve + taxi). Picks aren't included
  // since their trend isn't meaningful (FantasyCalc updates pick values
  // less frequently than player values).
  const all: ValuedAsset[] = [
    ...breakdown.starters.map((s) => s.asset),
    ...breakdown.bench,
    ...breakdown.reserve,
    ...breakdown.taxi,
  ];
  const total30d = all.reduce((s, a) => s + a.trend30Day, 0);
  const sorted = [...all].sort((a, b) => b.trend30Day - a.trend30Day);
  const topGainers = sorted.filter((a) => a.trend30Day > 0).slice(0, 3);
  const topLosers = sorted.filter((a) => a.trend30Day < 0).slice(-3).reverse();
  return {
    manager: breakdown.manager,
    rosterId: breakdown.rosterId,
    total30d,
    topGainers,
    topLosers,
  };
}

export default async function TrendPage() {
  const dynasty = await buildDynastyRankings();
  const month = new Date().getUTCMonth() + 1;
  const suppressed = isTrendSuppressed(month);
  const monthName = new Date().toLocaleString("en-US", { month: "long" });

  const trends: ManagerTrend[] = dynasty.rosters.map(aggregateTrends);
  const sortedByGain = [...trends].sort((a, b) => b.total30d - a.total30d);
  const biggestGain = sortedByGain[0];
  const biggestLoss = sortedByGain[sortedByGain.length - 1];

  return (
    <>
      <section className="relative overflow-hidden border-b border-border">
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 pt-10 pb-10 sm:pt-14 sm:pb-12">
          <SectionHeader
            kicker={`Snapshot ${dynasty.snapshotDate} · 30-day deltas`}
            title="Trend Tracker"
            description="Per-manager net change in dynasty value over the last 30 days. Off-season trends are unreliable; we suppress display April through July."
            size="lg"
          />
        </div>
      </section>

      {suppressed ? (
        <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-8">
          <Card
            variant="default"
            padding="md"
            className="border-warning/40 bg-warning/[0.04]"
          >
            <div className="flex items-start gap-3">
              <Snowflake
                size={18}
                strokeWidth={1.75}
                className="text-warning shrink-0 mt-0.5"
              />
              <div className="flex flex-col gap-1.5">
                <span className="font-medium text-foreground">
                  Trend suppression active — {monthName}
                </span>
                <p className="text-sm text-foreground-muted leading-relaxed">
                  We&rsquo;re between the end of last season and the rookie draft.
                  Trade volume is a fraction of in-season levels, so even small
                  movements amplify into big-looking 30-day swings. Numbers below
                  are rendered for transparency, but treat them as noise — wait
                  for August.
                </p>
              </div>
            </div>
          </Card>
        </section>
      ) : null}

      <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-6">
        <MetricExplainer
          title="Trend Tracker"
          summary="Net change in dynasty value over the trailing 30 days. Positive means the market is bidding the roster up; negative means assets are softening."
          bullets={[
            { term: "Calculated per asset", def: "Each player's 30-day delta is summed across the entire roster (starters, bench, reserve, taxi)." },
            { term: "Picks excluded", def: "FantasyCalc updates pick values less often, so they'd inject noise. Players only." },
            { term: "Off-season suppression", def: "April through July, low trade volume amplifies tiny moves. We dim the chart and warn you." },
            { term: "Risers and Fallers", def: "Each team's three biggest individual gainers and losers, surfaced inline." },
          ]}
        />
      </section>

      <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-8 grid grid-cols-2 sm:grid-cols-3 gap-3">
        {biggestGain ? (
          <StatTile
            label="Biggest gainer"
            value={biggestGain.total30d}
            precision={0}
            prefix={biggestGain.total30d >= 0 ? "+" : ""}
            accent="primary"
            subValue={`@${biggestGain.manager.username}`}
            animate={false}
          />
        ) : null}
        {biggestLoss ? (
          <StatTile
            label="Biggest loser"
            value={biggestLoss.total30d}
            precision={0}
            prefix={biggestLoss.total30d >= 0 ? "+" : ""}
            subValue={`@${biggestLoss.manager.username}`}
            animate={false}
          />
        ) : null}
        <StatTile
          label="League net"
          value={trends.reduce((s, t) => s + t.total30d, 0)}
          precision={0}
          subValue={`across ${trends.length} rosters`}
          animate={false}
        />
      </section>

      <section
        className={`mx-auto max-w-6xl px-4 sm:px-6 mt-8 sm:mt-10 grid grid-cols-1 lg:grid-cols-2 gap-3 ${suppressed ? "opacity-70" : ""}`}
      >
        {sortedByGain.map((t, i) => (
          <TrendRow key={t.rosterId} trend={t} rank={i + 1} suppressed={suppressed} />
        ))}
      </section>

      <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-12 mb-16">
        <RankingsCaveats />
      </section>
    </>
  );
}

function TrendRow({
  trend,
  rank,
  suppressed,
}: {
  trend: ManagerTrend;
  rank: number;
  suppressed: boolean;
}) {
  const tone = trend.total30d >= 0 ? "positive" : "negative";
  return (
    <Card variant="default" padding="md">
      <div className="flex items-center gap-3 mb-3">
        <span className="font-display text-2xl text-foreground-subtle tabular leading-none w-8 text-center">
          {rank.toString().padStart(2, "0")}
        </span>
        <Link
          href={`/managers/${trend.manager.username}`}
          className="flex items-center gap-3 group min-w-0 flex-1"
        >
          <ManagerAvatar manager={trend.manager} size={36} ring="subtle" />
          <span className="flex flex-col min-w-0">
            <span className="text-sm font-medium text-foreground truncate group-hover:text-accent transition-colors">
              {trend.manager.displayName}
            </span>
            <span className="text-[11px] text-foreground-subtle truncate">
              @{trend.manager.username}
            </span>
          </span>
        </Link>
        <Pill tone={suppressed ? "neutral" : tone} size="md">
          {trend.total30d >= 0 ? "+" : "−"}
          {Math.abs(trend.total30d).toLocaleString("en-US", {
            maximumFractionDigits: 0,
          })}
        </Pill>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <TrendingUp size={11} strokeWidth={2} className="text-positive" />
            <Kicker tone="muted">Risers</Kicker>
          </div>
          {trend.topGainers.length === 0 ? (
            <span className="text-[11px] text-foreground-subtle">—</span>
          ) : null}
          {trend.topGainers.map((a) => (
            <PlayerTrendCell key={a.assetId} asset={a} />
          ))}
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <TrendingDown size={11} strokeWidth={2} className="text-negative" />
            <Kicker tone="muted">Fallers</Kicker>
          </div>
          {trend.topLosers.length === 0 ? (
            <span className="text-[11px] text-foreground-subtle">—</span>
          ) : null}
          {trend.topLosers.map((a) => (
            <PlayerTrendCell key={a.assetId} asset={a} />
          ))}
        </div>
      </div>
    </Card>
  );
}

function PlayerTrendCell({ asset }: { asset: ValuedAsset }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <PlayerImage
        playerId={asset.assetId}
        position={asset.position}
        name={asset.name}
        size={20}
        fallbackColor={positionColor(asset.position)}
      />
      <span className="text-xs text-foreground truncate">{asset.name}</span>
      <span
        className="text-[11px] tabular shrink-0 ml-auto"
        style={{ color: trendColor(asset.trend30Day) }}
      >
        {asset.trend30Day >= 0 ? "+" : "−"}
        {Math.abs(asset.trend30Day).toLocaleString("en-US", {
          maximumFractionDigits: 0,
        })}
      </span>
    </div>
  );
}
