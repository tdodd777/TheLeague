import Link from "next/link";

import {
  Card,
  ManagerAvatar,
  SectionHeader,
  Sparkline,
} from "@/components/ui";
import { managerOverrides } from "@/config/managers";
import { LEAGUE_TAGLINE } from "@/config/site";
import {
  getCurrentLeague,
  getManagers,
  getStandings,
  getWeeklyPointsByRoster,
  listCachedSeasons,
} from "@/lib/data";

export default async function ManagersPage() {
  const { season } = await getCurrentLeague();
  const seasons = await listCachedSeasons();
  const managers = await getManagers(season);

  const recordSeason = seasons.find((s) => s !== season) ?? season;
  const standings = await getStandings(recordSeason);
  const weekly = await getWeeklyPointsByRoster(recordSeason);
  const standingsByUser = new Map(
    standings.map((row) => [row.manager.userId, row] as const),
  );
  const sortedManagers = [...managers.list].sort((a, b) => {
    const aRow = standingsByUser.get(a.userId);
    const bRow = standingsByUser.get(b.userId);
    if (!aRow || !bRow) return 0;
    return standings.indexOf(aRow) - standings.indexOf(bRow);
  });

  return (
    <main className="relative">
      <section className="relative overflow-hidden border-b border-border">
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 pt-10 pb-10 sm:pt-14 sm:pb-12">
          <SectionHeader
            kicker={`${managers.list.length} Owners · Sorted by ${recordSeason} finish`}
            title="The Managers"
            description={LEAGUE_TAGLINE}
            size="lg"
          />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-8">
        <ol className="border-y border-rule">
          {sortedManagers.map((m, i) => {
            const last = standingsByUser.get(m.userId);
            const finishRank = last ? standings.indexOf(last) + 1 : null;
            const wk = last ? (weekly.get(last.rosterId) ?? []) : [];
            const override = managerOverrides[m.userId];
            const ordinal = String(i + 1).padStart(2, "0");
            return (
              <li key={m.userId}>
                <Link
                  href={`/managers/${m.username}`}
                  className="block group hover:bg-row-hover transition-colors"
                  style={{ viewTransitionName: `manager-card-${m.userId}` }}
                >
                  <Card variant="row" as="div" className="flex items-center gap-4">
                    <span
                      className="font-display text-2xl text-foreground-subtle tabular leading-none w-8 shrink-0"
                      aria-hidden
                    >
                      {ordinal}
                    </span>
                    <ManagerAvatar
                      manager={m}
                      size={36}
                      ring={override?.accentColor ? "accent" : "subtle"}
                    />
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="font-display text-2xl sm:text-[28px] text-foreground leading-tight truncate group-hover:text-accent transition-colors">
                        {m.displayName}
                      </span>
                      <span className="text-[11px] text-foreground-subtle truncate tabular">
                        @{m.username}
                        {override?.location ? ` · ${override.location}` : ""}
                        {last
                          ? ` · ${last.wins}-${last.losses}${last.ties ? `-${last.ties}` : ""}`
                          : ""}
                        {finishRank ? ` · #${finishRank} ${recordSeason}` : ""}
                      </span>
                    </div>
                    {wk.length >= 2 ? (
                      <div className="hidden sm:flex flex-col items-end gap-1 shrink-0">
                        <Sparkline
                          values={wk}
                          width={120}
                          height={24}
                          stroke="var(--accent-primary)"
                          fillGradient
                          className="text-accent"
                          endDot={false}
                        />
                        <span className="text-[10px] text-foreground-subtle tabular">
                          avg {(wk.reduce((a, b) => a + b, 0) / wk.length).toFixed(0)}
                        </span>
                      </div>
                    ) : null}
                  </Card>
                </Link>
              </li>
            );
          })}
        </ol>
      </section>
    </main>
  );
}
