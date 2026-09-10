import Link from "next/link";

import {
  Card,
  Kicker,
  ManagerAvatar,
  Pill,
  ScatterPlot,
  SectionHeader,
} from "@/components/ui";
import { MetricExplainer } from "@/components/rankings/MetricExplainer";
import { RankingsCaveats } from "@/components/rankings/RankingsCaveats";
import { buildQuadrant, type QuadrantEntry } from "@/lib/rankings/quadrant";

export const dynamic = "force-static";

export default async function QuadrantPage() {
  const { points, xMedian, yMedian, trendSuppressed, buckets } =
    await buildQuadrant();

  return (
    <>
      <section className="relative overflow-hidden border-b border-border">
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 pt-10 pb-10 sm:pt-14 sm:pb-12">
          <SectionHeader
            kicker="Now versus future"
            title="The Contender Quadrant"
            description="Each bubble is a manager. X = season power. Y = dynasty value. Bubble size grows with average starter age (smaller = younger). Bubble color shows 30-day trend (green up, red down). Axes split at the league median."
            size="lg"
          />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-6">
        <MetricExplainer
          title="The Quadrant"
          summary="Plots each team's right-now strength against its long-term value. The four quadrants tell you whether a team should buy, sell, hold, or panic."
          bullets={[
            { term: "Contender (top-right)", def: "Above-median in both season power and dynasty value — built to win now and later." },
            { term: "Win-Now (bottom-right)", def: "Strong this year, lighter long-term. Window is open; press it." },
            { term: "Rebuilder (top-left)", def: "Cold this year but stockpiled for the future. Patience pays." },
            { term: "Stuck (bottom-left)", def: "Below-median in both. Reset hard or wait it out." },
          ]}
        />
      </section>

      {/*
        The chart is desktop-only. At 390px the 780px SVG scales to ~0.41, which
        renders its 10px labels at roughly 4px. The quadrant lists below carry
        the same classification and are readable on a phone.
      */}
      <section className="hidden lg:block mx-auto max-w-6xl px-4 sm:px-6 mt-8">
        <Card variant="default" padding="md">
          <ScatterPlot
            points={points}
            width={780}
            height={460}
            xLabel="season power →"
            yLabel="dynasty value →"
            medianX={xMedian}
            medianY={yMedian}
            quadrantLabels={{
              tr: "Contender",
              tl: "Rebuilder",
              br: "Win-Now",
              bl: "Stuck",
            }}
          />
          {trendSuppressed ? (
            <p className="mt-3 text-xs text-foreground-subtle">
              30-day trends suppressed for {new Date().toLocaleString("en-US", { month: "long" })} — values are flat-colored. Trend coloring resumes once the trade market warms up in late summer.
            </p>
          ) : null}
        </Card>
      </section>

      {/* Quadrant lists */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-12 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <QuadrantList
          title="Contenders"
          subtitle="Great now AND later"
          tone="positive"
          managers={buckets["Contender"] ?? []}
        />
        <QuadrantList
          title="Rebuilders"
          subtitle="Bad now, stockpiled"
          tone="accent"
          managers={buckets["Rebuilder"] ?? []}
        />
        <QuadrantList
          title="Win-Now"
          subtitle="Great now, window closing"
          tone="warning"
          managers={buckets["Win-Now"] ?? []}
        />
        <QuadrantList
          title="Stuck"
          subtitle="The danger zone"
          tone="negative"
          managers={buckets["Stuck"] ?? []}
        />
      </section>

      <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-12 mb-16">
        <RankingsCaveats />
      </section>
    </>
  );
}

function QuadrantList({
  title,
  subtitle,
  tone,
  managers,
}: {
  title: string;
  subtitle: string;
  tone: "positive" | "negative" | "accent" | "warning";
  managers: QuadrantEntry[];
}) {
  return (
    <Card variant="default" padding="md">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <div className="flex flex-col gap-0.5">
          <Kicker>{title}</Kicker>
          <span className="text-[11px] text-foreground-subtle">{subtitle}</span>
        </div>
        <Pill tone={tone} size="sm">
          {managers.length}
        </Pill>
      </div>
      <ul className="flex flex-col">
        {managers.length === 0 ? (
          <li className="text-xs text-foreground-subtle py-1">—</li>
        ) : null}
        {managers.map((m) => (
          <li
            key={m.rosterId}
            className="flex items-center gap-3 py-1.5 border-b border-border/50 last:border-b-0"
          >
            <Link
              href={`/managers/${m.username}`}
              className="flex items-center gap-2 min-w-0 flex-1 group"
            >
              <ManagerAvatar manager={m.manager} size={28} ring="subtle" />
              <span className="text-sm text-foreground truncate group-hover:text-accent transition-colors">
                {m.manager.displayName}
              </span>
            </Link>
            <span className="text-xs tabular text-foreground-subtle shrink-0">
              S {m.seasonPower.toFixed(0)} · D {(m.dynastyTotal / 1000).toFixed(0)}k
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
