import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { Card, Kicker, ScatterPlot } from "@/components/ui";
import type { HomeVisuals as HomeVisualsData } from "@/lib/landing/visuals";

import { BarList } from "./BarList";

const QUADRANT_LABELS = {
  tr: "Contender",
  tl: "Rebuilder",
  br: "Win-Now",
  bl: "Stuck",
};

function Block({
  kicker,
  takeaway,
  href,
  cta,
  children,
}: {
  kicker: string;
  takeaway: string;
  href: string;
  cta: string;
  children: React.ReactNode;
}) {
  return (
    <Card as="article" variant="default" padding="md" className="flex h-full flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Kicker>{kicker}</Kicker>
        <p className="text-[15px] leading-snug text-foreground text-balance">{takeaway}</p>
      </div>
      {children}
      <Link
        href={href}
        className="mt-auto inline-flex min-h-11 sm:min-h-0 items-center gap-1 self-start text-[11px] uppercase tracking-[0.16em] text-foreground-subtle hover:text-foreground transition-colors focus-hairline"
      >
        {cta} <ArrowUpRight size={12} strokeWidth={1.75} />
      </Link>
    </Card>
  );
}

/**
 * The three pictures under the masthead. Bars are plain divs; the quadrant
 * is the same ScatterPlot as the rankings page, drawn twice so the phone
 * gets a version sized for its width.
 */
export function HomeVisuals({ data }: { data: HomeVisualsData }) {
  const { week, quadrant, swings } = data;
  if (!week && !quadrant && !swings) return null;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {week ? (
        <Block
          kicker={`Week ${week.week} projected lineups`}
          takeaway={week.takeaway}
          href="/matchups"
          cta="Matchups"
        >
          <BarList rows={week.rows} mode="ranked" format={(v) => v.toFixed(1)} />
        </Block>
      ) : null}

      {swings ? (
        <Block
          kicker={`Dynasty value, last 30 days · snapshot ${swings.snapshotDate}`}
          takeaway={swings.takeaway}
          href="/rankings/trend"
          cta="Trend rankings"
        >
          <BarList
            rows={swings.rows}
            mode="diverging"
            format={(v) =>
              `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.round(Math.abs(v)).toLocaleString("en-US")}`
            }
          />
        </Block>
      ) : null}

      {quadrant ? (
        <div className="lg:col-span-2">
          <Block
            kicker="Now versus future"
            takeaway={quadrant.takeaway}
            href="/rankings/quadrant"
            cta="Contender quadrant"
          >
            <div className="hidden sm:block">
              <ScatterPlot
                points={quadrant.points}
                width={780}
                height={400}
                xLabel="season power →"
                yLabel="dynasty value →"
                medianX={quadrant.xMedian}
                medianY={quadrant.yMedian}
                quadrantLabels={QUADRANT_LABELS}
                className="w-full h-auto"
              />
            </div>
            <div className="sm:hidden flex flex-col gap-3">
              {/* Twelve labels do not fit at phone width; the list below names them. */}
              <ScatterPlot
                points={quadrant.points.map(({ label: _label, ...p }) => p)}
                width={360}
                height={300}
                xLabel="season power →"
                yLabel="dynasty value →"
                medianX={quadrant.xMedian}
                medianY={quadrant.yMedian}
                quadrantLabels={QUADRANT_LABELS}
                className="w-full h-auto"
              />
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
                {(["Contender", "Rebuilder", "Win-Now", "Stuck"] as const).map((name) => (
                  <div key={name} className="min-w-0">
                    <dt className="text-[10px] uppercase tracking-[0.16em] text-foreground-subtle">
                      {name}
                    </dt>
                    <dd className="text-foreground-muted leading-snug">
                      {quadrant.buckets[name].length > 0
                        ? quadrant.buckets[name].map((c) => c.username).join(", ")
                        : "nobody"}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
            <p className="text-[11px] text-foreground-subtle">
              Bigger bubble, older starting lineup. Green is rising in value over 30 days, red is falling.
            </p>
          </Block>
        </div>
      ) : null}
    </div>
  );
}
