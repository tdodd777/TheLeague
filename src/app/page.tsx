import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { LiveScoreboard } from "@/components/live/LiveScoreboard";
import {
  Kicker,
  ManagerAvatar,
  Pill,
  Sparkline,
} from "@/components/ui";
import { LEAGUE_BLURB } from "@/config/about";
import { LEAGUE_NAME } from "@/config/site";
import { cn } from "@/lib/cn";
import { getCurrentLeague, getManagers } from "@/lib/data";
import type { FeedTransaction } from "@/lib/data";
import { HomeVisuals } from "@/components/landing/HomeVisuals";
import { getHomeVisuals } from "@/lib/landing/visuals";
import { getLandingInsights, type Lede } from "@/lib/landing/insights";

export default async function HomePage() {
  const { season, league } = await getCurrentLeague();
  const managers = await getManagers(season);
  const [insights, visuals] = await Promise.all([
    getLandingInsights(season, league),
    getHomeVisuals(),
  ]);

  const liveManagers = managers.list.map((m) => ({
    rosterId: m.rosterId,
    username: m.username,
    displayName: m.displayName,
    avatarUrl: m.avatarUrl,
  }));

  const staticHero = (
    <section className="relative overflow-hidden border-b border-border">
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 pt-10 pb-8 sm:pt-16 sm:pb-12 flex flex-col gap-8">
        <div className="flex flex-col gap-5 max-w-3xl">
          <Kicker>{insights.phaseLine}</Kicker>
          <h1 className="font-display text-foreground text-[3.5rem] sm:text-[6rem] lg:text-[7rem] leading-[0.9] tracking-tight -ml-1">
            {LEAGUE_NAME}
          </h1>
          <p className="text-foreground-muted text-base sm:text-[17px] leading-relaxed max-w-2xl">
            {LEAGUE_BLURB}
          </p>
        </div>
      </div>
    </section>
  );

  const sortedManagers = [...managers.list].sort((a, b) =>
    a.displayName.localeCompare(b.displayName),
  );

  // Sunday-mode (regular season): live scoreboard + actionable strip lead;
  // Lede gets demoted to the bottom. Off-season: editorial Lede leads.
  const isInSeason = league.status === "in_season";
  const recentMoves = isInSeason
    ? insights.activity.slice(0, 5)
    : insights.activity;

  const ledeSection = insights.lede ? (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-12 sm:mt-16">
      <LedeBlock lede={insights.lede} />
    </section>
  ) : null;

  const visualsSection =
    visuals.week || visuals.quadrant || visuals.swings ? (
      <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-10 sm:mt-14">
        <HomeVisuals data={visuals} />
      </section>
    ) : null;

  const recentMovesSection = recentMoves.length > 0 ? (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-12 sm:mt-16">
      <div className="flex items-baseline justify-between gap-3">
        <Kicker>Recent Moves</Kicker>
        <Link
          href="/transactions"
          className="inline-flex min-h-11 lg:min-h-0 items-center gap-1 text-[11px] text-foreground-muted hover:text-foreground transition-colors focus-hairline"
        >
          All transactions <ArrowUpRight size={12} strokeWidth={1.75} />
        </Link>
      </div>
      <ul className="mt-4 border-y border-rule divide-y divide-rule">
        {recentMoves.map((tx) => (
          <ActivityRow key={tx.transactionId} tx={tx} />
        ))}
      </ul>
    </section>
  ) : null;

  const twelveSection = (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-12 sm:mt-16 pb-12">
      <div className="flex items-baseline justify-between gap-3">
        <Kicker>The Twelve</Kicker>
        <Link
          href="/managers"
          className="inline-flex min-h-11 lg:min-h-0 items-center gap-1 text-[11px] text-foreground-muted hover:text-foreground transition-colors focus-hairline"
        >
          All managers <ArrowUpRight size={12} strokeWidth={1.75} />
        </Link>
      </div>
      <ol className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8">
        {sortedManagers.map((m, i) => (
          <li
            key={m.userId}
            className="border-b border-rule last:border-b-0 sm:[&:nth-last-child(2)]:border-b-0 lg:[&:nth-last-child(3)]:border-b-0"
          >
            <Link
              href={`/managers/${m.username}`}
              className="flex items-baseline gap-3 py-2.5 group"
              style={{ viewTransitionName: `manager-card-${m.userId}` }}
            >
              <span className="text-[10px] tabular text-foreground-subtle w-6 shrink-0">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="font-display text-2xl text-foreground leading-none group-hover:text-accent transition-colors truncate">
                {m.displayName}
              </span>
              <span className="ml-auto text-[11px] text-foreground-subtle truncate tabular hidden sm:inline">
                @{m.username}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );

  return (
    <main className="relative">
      <LiveScoreboard
        leagueId={league.league_id}
        managers={liveManagers}
        fallback={staticHero}
      />

      {isInSeason ? (
        <>
          {/* In season: the pictures lead, then the wire, then the twelve. */}
          {visualsSection}
          {recentMovesSection}
          {twelveSection}
        </>
      ) : (
        <>
          {/* Off-season: the champion or the draft leads, then the pictures. */}
          {ledeSection}
          {visualsSection}
          {recentMovesSection}
          {twelveSection}
        </>
      )}
    </main>
  );
}

/* ============================================================ */
/*  LEDE                                                        */
/* ============================================================ */

function LedeBlock({ lede }: { lede: Lede }) {
  switch (lede.kind) {
    case "champion":
      return <LedeChampion lede={lede} />;
    case "draft":
      return <LedeDraft lede={lede} />;
    case "crowned":
      return <LedeCrowned lede={lede} />;
  }
}

function LedeChampion({
  lede,
}: {
  lede: Extract<Lede, { kind: "champion" }>;
}) {
  const { champ, weekly, topMover, lastSeason } = lede;
  const max = weekly.length > 0 ? Math.max(...weekly) : 0;
  const min = weekly.length > 0 ? Math.min(...weekly) : 0;

  return (
    <article className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 items-start">
      <div className="lg:col-span-6 flex flex-col gap-5">
        <Kicker>The Reigning · {lastSeason} Champion</Kicker>
        <Link
          href={`/managers/${champ.manager.username}`}
          className="group flex items-center gap-5"
        >
          <ManagerAvatar
            manager={champ.manager}
            size={96}
            ring="gradient"
            priority
          />
          <div className="flex flex-col min-w-0">
            <span className="font-display text-4xl sm:text-5xl text-foreground leading-[0.95] text-balance group-hover:text-accent transition-colors">
              {champ.manager.displayName}
            </span>
            <span className="text-sm text-foreground-muted mt-1.5 truncate">
              @{champ.manager.username}
            </span>
            <div className="flex items-center gap-3 mt-3">
              <Pill tone="accent" size="md">
                {champ.wins}–{champ.losses}
                {champ.ties ? `–${champ.ties}` : ""}
              </Pill>
              <span className="text-sm text-foreground-muted tabular">
                {champ.pf.toFixed(1)} PF
              </span>
            </div>
          </div>
        </Link>
      </div>

      <div className="lg:col-span-6 flex flex-col gap-4">
        {weekly.length >= 2 && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[10px] uppercase tracking-[0.18em] text-foreground-subtle">
                Weekly PF · {lastSeason}
              </span>
              <span className="text-xs text-foreground-muted tabular">
                max {max.toFixed(1)} · min {min.toFixed(1)}
              </span>
            </div>
            <Sparkline
              values={weekly}
              width={520}
              height={56}
              stroke="var(--accent-primary)"
              className="text-accent w-full"
              ariaLabel={`${champ.manager.displayName} weekly points for ${lastSeason}`}
            />
          </div>
        )}

        {topMover && (
          <div className="text-sm text-foreground-muted leading-relaxed pt-3 border-t border-border">
            <span className="text-[10px] uppercase tracking-[0.18em] text-foreground-subtle mr-2">
              Roster mover · 30d
            </span>
            <span className="font-medium text-foreground">{topMover.name}</span>
            <span className="text-foreground-subtle"> · </span>
            <span
              className={cn(
                "tabular",
                topMover.trend30Day > 0 ? "text-positive" : "text-negative",
              )}
            >
              {topMover.trend30Day > 0 ? "+" : ""}
              {topMover.trend30Day.toFixed(0)}
            </span>
          </div>
        )}
      </div>
    </article>
  );
}

function LedeDraft({ lede }: { lede: Extract<Lede, { kind: "draft" }> }) {
  const { draft } = lede;
  const start = formatStartTime(draft.start_time);
  return (
    <article className="flex flex-col gap-3 max-w-2xl">
      <Kicker>The Draft</Kicker>
      <h2 className="font-display text-4xl sm:text-5xl text-foreground leading-[0.95]">
        On the clock
      </h2>
      <p className="text-foreground-muted leading-relaxed">
        {draft.settings.rounds}-round {draft.type} draft · starts {start}
      </p>
    </article>
  );
}

function LedeCrowned({
  lede,
}: {
  lede: Extract<Lede, { kind: "crowned" }>;
}) {
  const { champ, runnerUp, season } = lede;
  return (
    <article className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
      <div className="lg:col-span-7 flex flex-col gap-4">
        <Kicker>The {season} Champion</Kicker>
        <Link
          href={`/managers/${champ.manager.username}`}
          className="group flex items-center gap-5"
        >
          <ManagerAvatar
            manager={champ.manager}
            size={96}
            ring="gradient"
            priority
          />
          <div className="min-w-0">
            <div className="font-display text-4xl sm:text-5xl text-foreground leading-[0.95] group-hover:text-accent transition-colors text-balance">
              {champ.manager.displayName}
            </div>
            <div className="mt-2 flex items-center gap-3">
              <Pill tone="accent" size="md">
                {champ.wins}–{champ.losses}
                {champ.ties ? `–${champ.ties}` : ""}
              </Pill>
              <span className="text-sm text-foreground-muted tabular">
                {champ.pf.toFixed(1)} PF
              </span>
            </div>
          </div>
        </Link>
      </div>
      {runnerUp && (
        <div className="lg:col-span-5 flex flex-col gap-2 lg:border-l lg:border-border lg:pl-6">
          <span className="text-[10px] uppercase tracking-[0.18em] text-foreground-subtle">
            Runner-up
          </span>
          <Link
            href={`/managers/${runnerUp.manager.username}`}
            className="flex items-center gap-3 group"
          >
            <ManagerAvatar manager={runnerUp.manager} size={36} ring="subtle" />
            <div className="min-w-0">
              <div className="font-display text-xl text-foreground-muted truncate group-hover:text-accent transition-colors">
                {runnerUp.manager.displayName}
              </div>
              <div className="text-xs text-foreground-subtle tabular">
                {runnerUp.wins}–{runnerUp.losses}
                {runnerUp.ties ? `–${runnerUp.ties}` : ""} ·{" "}
                {runnerUp.pf.toFixed(1)} PF
              </div>
            </div>
          </Link>
        </div>
      )}
    </article>
  );
}

/* ============================================================ */
/*  ACTIVITY                                                    */
/* ============================================================ */

function ActivityRow({ tx }: { tx: FeedTransaction }) {
  const verb =
    tx.type === "trade"
      ? "Trade"
      : tx.type === "waiver"
        ? "Waiver"
        : "Free agent";
  return (
    <li className="flex items-center gap-3 py-3">
      <div className="flex -space-x-2 shrink-0">
        {tx.parties.slice(0, 3).map((p) => (
          <span
            key={p.rosterId}
            className="ring-2 ring-background rounded-full inline-block"
          >
            <ManagerAvatar manager={p.manager} size={28} ring="none" />
          </span>
        ))}
      </div>
      <div className="flex-1 min-w-0">
        <span className="font-display italic text-[15px] text-foreground-muted mr-2.5">
          {verb}
        </span>
        <span className="text-[13px] text-foreground">{describeTx(tx)}</span>
      </div>
      <span className="text-[11px] text-foreground-subtle tabular shrink-0">
        {fmtDate(tx.statusUpdated)}
      </span>
    </li>
  );
}

function describeTx(tx: FeedTransaction): string {
  if (tx.type === "trade") {
    const sides = tx.parties.map((p) => {
      const items: string[] = [];
      for (const a of p.adds) items.push(a.name);
      for (const pk of p.picksReceived)
        items.push(`${pk.season} R${pk.round}`);
      const summary = items.length > 0 ? items.join(", ") : "—";
      return `${p.manager.displayName} got ${summary}`;
    });
    return sides.join("  ↔  ");
  }
  if (tx.type === "waiver") {
    const p = tx.parties[0];
    if (!p) return "Waiver claim";
    const adds = p.adds.map((a) => a.name).join(", ");
    const drops = p.drops.map((d) => d.name).join(", ");
    const head = adds
      ? `${p.manager.displayName} claimed ${adds}`
      : `${p.manager.displayName} placed claim`;
    return drops ? `${head} (dropped ${drops})` : head;
  }
  // free_agent
  const p = tx.parties[0];
  if (!p) return "Free agent move";
  const adds = p.adds.map((a) => a.name).join(", ");
  const drops = p.drops.map((d) => d.name).join(", ");
  const head = adds
    ? `${p.manager.displayName} added ${adds}`
    : `${p.manager.displayName} moved`;
  return drops ? `${head} (dropped ${drops})` : head;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function fmtDate(ms: number): string {
  const d = new Date(ms);
  // UTC methods so server and client agree on the rendered string.
  const m = MONTHS[d.getUTCMonth()] ?? "?";
  const day = d.getUTCDate();
  const year = d.getUTCFullYear();
  const nowYear = new Date().getUTCFullYear();
  if (year === nowYear) return `${m} ${day}`;
  return `${m} ${day}, '${String(year).slice(2)}`;
}

function formatStartTime(ms: number | null): string {
  if (!ms) return "TBA";
  const d = new Date(ms);
  const m = MONTHS[d.getUTCMonth()] ?? "?";
  const day = d.getUTCDate();
  const year = d.getUTCFullYear();
  return `${m} ${day}, ${year}`;
}
