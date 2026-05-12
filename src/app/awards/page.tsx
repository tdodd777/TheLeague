import { Trophy } from "lucide-react";
import Link from "next/link";

import {
  AwardsPodium,
  Card,
  EmptyState,
  Kicker,
  ManagerAvatar,
  Pill,
  SectionHeader,
  StatTile,
  type PodiumStep,
} from "@/components/ui";
import { LEAGUE_NAME } from "@/config/site";
import {
  getManagers,
  getSeasonPlacements,
  getStandings,
  listCachedSeasons,
  readLeague,
} from "@/lib/data";
import type { Manager } from "@/lib/types";

export const dynamic = "force-static";

export const metadata = {
  title: `Awards · ${LEAGUE_NAME}`,
  description:
    "Champion gallery, Toilet Bowl winners, regular-season titles, and the all-time hardware count.",
};

interface SeasonAwards {
  season: string;
  champion: Manager | null;
  runnerUp: Manager | null;
  third: Manager | null;
  toiletBowl: Manager | null;
  regularSeasonKing: { manager: Manager; record: string } | null;
}

interface AllTimeTitle {
  manager: Manager;
  championships: string[];
  runnersUp: string[];
  thirds: string[];
  regularSeason: string[];
  toiletBowls: string[];
  /** Composite "hardware" count — championships + runners-up + thirds + RS titles. */
  hardware: number;
}

export default async function AwardsPage() {
  const seasons = await listCachedSeasons();

  const seasonAwards: SeasonAwards[] = [];
  const titles = new Map<string, AllTimeTitle>();

  function bump(
    manager: Manager,
    bucket: keyof Omit<AllTimeTitle, "manager" | "hardware">,
    season: string,
  ) {
    let entry = titles.get(manager.userId);
    if (!entry) {
      entry = {
        manager,
        championships: [],
        runnersUp: [],
        thirds: [],
        regularSeason: [],
        toiletBowls: [],
        hardware: 0,
      };
      titles.set(manager.userId, entry);
    }
    entry[bucket].push(season);
    if (
      bucket === "championships" ||
      bucket === "runnersUp" ||
      bucket === "thirds" ||
      bucket === "regularSeason"
    ) {
      entry.hardware += 1;
    }
  }

  for (const season of seasons) {
    const [league, standings, placements, managers] = await Promise.all([
      readLeague(season),
      getStandings(season),
      getSeasonPlacements(season),
      getManagers(season),
    ]);
    if (league.status !== "complete") continue;

    const champion = pickManager(placements.champion, managers.byRosterId);
    const runnerUp = pickManager(placements.runnerUp, managers.byRosterId);
    const third = pickManager(placements.third, managers.byRosterId);
    const toiletBowl = pickManager(placements.toiletBowlChamp, managers.byRosterId);

    const regSeasonKing =
      standings[0] && standings[0].wins + standings[0].losses + standings[0].ties > 0
        ? standings[0]
        : null;

    seasonAwards.push({
      season,
      champion,
      runnerUp,
      third,
      toiletBowl,
      regularSeasonKing: regSeasonKing
        ? {
            manager: regSeasonKing.manager,
            record: `${regSeasonKing.wins}-${regSeasonKing.losses}${regSeasonKing.ties ? `-${regSeasonKing.ties}` : ""}`,
          }
        : null,
    });

    if (champion) bump(champion, "championships", season);
    if (runnerUp) bump(runnerUp, "runnersUp", season);
    if (third) bump(third, "thirds", season);
    if (toiletBowl) bump(toiletBowl, "toiletBowls", season);
    if (regSeasonKing) bump(regSeasonKing.manager, "regularSeason", season);
  }

  if (seasonAwards.length === 0) {
    return (
      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-16">
        <SectionHeader
          kicker="No completed seasons"
          title="Awards"
          description="The trophy case is bare — finish a season to start filling it."
          size="lg"
        />
        <div className="mt-8">
          <EmptyState
            title="No hardware on the board"
            description="Once a season completes, champions, runners-up, and toilet-bowl winners will appear here."
          />
        </div>
      </main>
    );
  }

  const allTimeTitles = [...titles.values()].sort(
    (a, b) =>
      b.championships.length - a.championships.length ||
      b.hardware - a.hardware ||
      a.manager.username.localeCompare(b.manager.username),
  );

  const totalChampionships = seasonAwards.filter((s) => s.champion).length;
  const distinctChamps = new Set(
    seasonAwards.filter((s) => s.champion).map((s) => s.champion!.userId),
  );
  const repeatChampion =
    allTimeTitles.find((t) => t.championships.length >= 2) ?? null;

  return (
    <main className="relative">
      <section className="relative overflow-hidden border-b border-border">
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 pt-10 pb-10 sm:pt-14 sm:pb-12">
          <SectionHeader
            kicker={
              <>
                <Trophy
                  className="inline-block mr-1.5 mb-0.5"
                  size={11}
                  strokeWidth={2}
                />
                Hardware
              </>
            }
            title="Awards"
            description="Every champion, every runner-up, every Toilet Bowl. The receipts in trophy form."
            size="lg"
          />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile
          label="Championships"
          value={totalChampionships}
          accent="primary"
          subValue={`${distinctChamps.size} distinct champion${distinctChamps.size === 1 ? "" : "s"}`}
        />
        <StatTile
          label="Repeat winners"
          value={
            allTimeTitles.filter((t) => t.championships.length >= 2).length
          }
          accent="primary"
          subValue={
            repeatChampion
              ? `top: @${repeatChampion.manager.username} (${repeatChampion.championships.length}×)`
              : "no back-to-backs yet"
          }
        />
        <StatTile
          label="Toilet bowl winners"
          value={seasonAwards.filter((s) => s.toiletBowl).length}
          accent="secondary"
          subValue="last-place trophies awarded"
        />
        <StatTile
          label="Regular-season kings"
          value={seasonAwards.filter((s) => s.regularSeasonKing).length}
          accent="secondary"
          subValue={`${
            new Set(
              seasonAwards
                .filter((s) => s.regularSeasonKing)
                .map((s) => s.regularSeasonKing!.manager.userId),
            ).size
          } distinct`}
        />
      </section>

      {/* PODIUM PER SEASON */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-10 sm:mt-14 flex flex-col gap-5">
        <SectionHeader
          kicker="Per-Season Podium"
          title="Champions Gallery"
          description="The 1st / 2nd / 3rd podium for every season the league has finished."
          size="md"
        />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {seasonAwards.map((s) => {
            const podium: PodiumStep[] = [
              { place: 1, manager: s.champion },
              { place: 2, manager: s.runnerUp },
              { place: 3, manager: s.third },
            ];
            return (
              <Card key={s.season} variant="default" padding="lg">
                <div className="flex items-baseline justify-between mb-4">
                  <Kicker>{s.season}</Kicker>
                  <Link
                    href={`/history/${s.season}`}
                    className="text-[11px] text-foreground-muted hover:text-accent transition-colors"
                  >
                    full recap →
                  </Link>
                </div>
                <AwardsPodium steps={podium} />
                <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {s.regularSeasonKing ? (
                    <div className="flex items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5">
                      <Pill tone="secondary" size="sm">
                        Reg-Season
                      </Pill>
                      <Link
                        href={`/managers/${s.regularSeasonKing.manager.username}`}
                        className="text-foreground hover:text-accent transition-colors truncate"
                      >
                        @{s.regularSeasonKing.manager.username}
                      </Link>
                      <span className="text-foreground-subtle tabular ml-auto">
                        {s.regularSeasonKing.record}
                      </span>
                    </div>
                  ) : null}
                  {s.toiletBowl ? (
                    <div className="flex items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5">
                      <Pill tone="warning" size="sm">
                        Toilet Bowl
                      </Pill>
                      <Link
                        href={`/managers/${s.toiletBowl.username}`}
                        className="text-foreground hover:text-accent transition-colors truncate"
                      >
                        @{s.toiletBowl.username}
                      </Link>
                    </div>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      {/* ALL-TIME LEADERBOARD */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-12 sm:mt-16 flex flex-col gap-5">
        <SectionHeader
          kicker="All-Time"
          title="The Trophy Case"
          description="Total hardware per manager: championships, runner-up finishes, third-place finishes, and regular-season titles."
          size="md"
        />
        <Card variant="default" padding="none" className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 sm:px-4 h-10 text-left text-[10px] font-medium uppercase tracking-[0.18em] text-foreground-subtle">
                  Manager
                </th>
                <th className="px-3 sm:px-4 h-10 text-right text-[10px] font-medium uppercase tracking-[0.18em] text-foreground-subtle">
                  🏆
                </th>
                <th className="px-3 sm:px-4 h-10 text-right text-[10px] font-medium uppercase tracking-[0.18em] text-foreground-subtle">
                  2nd
                </th>
                <th className="px-3 sm:px-4 h-10 text-right text-[10px] font-medium uppercase tracking-[0.18em] text-foreground-subtle">
                  3rd
                </th>
                <th className="px-3 sm:px-4 h-10 text-right text-[10px] font-medium uppercase tracking-[0.18em] text-foreground-subtle">
                  Reg
                </th>
                <th className="px-3 sm:px-4 h-10 text-right text-[10px] font-medium uppercase tracking-[0.18em] text-foreground-subtle">
                  🚽
                </th>
                <th className="px-3 sm:px-4 h-10 text-right text-[10px] font-medium uppercase tracking-[0.18em] text-foreground-subtle">
                  Yrs
                </th>
              </tr>
            </thead>
            <tbody>
              {allTimeTitles.map((t) => (
                <tr
                  key={t.manager.userId}
                  className="border-b border-border/60 last:border-b-0"
                >
                  <td className="px-3 sm:px-4 py-2.5">
                    <Link
                      href={`/managers/${t.manager.username}`}
                      className="flex items-center gap-3 group"
                    >
                      <ManagerAvatar manager={t.manager} size={28} ring="subtle" />
                      <span className="flex flex-col min-w-0">
                        <span className="text-sm font-medium text-foreground group-hover:text-accent transition-colors truncate">
                          {t.manager.displayName}
                        </span>
                        <span className="text-xs text-foreground-subtle truncate">
                          @{t.manager.username}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-3 sm:px-4 py-2.5 text-right tabular text-sm">
                    {t.championships.length || "—"}
                    {t.championships.length > 0 ? (
                      <span className="block text-[10px] text-foreground-subtle">
                        {t.championships.join(", ")}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 sm:px-4 py-2.5 text-right tabular text-sm text-foreground-muted">
                    {t.runnersUp.length || "—"}
                    {t.runnersUp.length > 0 ? (
                      <span className="block text-[10px] text-foreground-subtle">
                        {t.runnersUp.join(", ")}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 sm:px-4 py-2.5 text-right tabular text-sm text-foreground-muted">
                    {t.thirds.length || "—"}
                    {t.thirds.length > 0 ? (
                      <span className="block text-[10px] text-foreground-subtle">
                        {t.thirds.join(", ")}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 sm:px-4 py-2.5 text-right tabular text-sm text-foreground-muted">
                    {t.regularSeason.length || "—"}
                    {t.regularSeason.length > 0 ? (
                      <span className="block text-[10px] text-foreground-subtle">
                        {t.regularSeason.join(", ")}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 sm:px-4 py-2.5 text-right tabular text-sm text-foreground-muted">
                    {t.toiletBowls.length || "—"}
                    {t.toiletBowls.length > 0 ? (
                      <span className="block text-[10px] text-foreground-subtle">
                        {t.toiletBowls.join(", ")}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 sm:px-4 py-2.5 text-right tabular text-sm text-foreground-subtle">
                    {t.hardware}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>
    </main>
  );
}

function pickManager(
  rosterId: number | null,
  byRosterId: Map<number, Manager>,
): Manager | null {
  if (rosterId === null) return null;
  return byRosterId.get(rosterId) ?? null;
}
