import Link from "next/link";
import { redirect } from "next/navigation";

import { EmptyState, SectionHeader } from "@/components/ui";
import { latestCachedMatchupWeek } from "@/lib/data";

export const dynamic = "force-static";

export default async function MatchupsIndexPage() {
  const latest = await latestCachedMatchupWeek();
  if (latest) {
    redirect(`/matchups/${latest.season}/${String(latest.week).padStart(2, "0")}`);
  }

  return (
    <main className="relative">
      <section className="relative overflow-hidden border-b border-border">
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 pt-10 pb-10 sm:pt-14 sm:pb-12">
          <SectionHeader
            kicker="Matchups"
            title="Matchups"
            description="No matchup data yet."
            size="lg"
          />
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-8">
        <EmptyState
          title="Pre-season"
          description="Weekly scoreboards appear once the regular season kicks off."
          action={
            <Link
              href="/standings"
              className="inline-flex items-center rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-foreground-muted hover:text-foreground transition-colors"
            >
              View standings
            </Link>
          }
        />
      </section>
    </main>
  );
}
