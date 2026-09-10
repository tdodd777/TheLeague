import { redirect } from "next/navigation";

import { EmptyState, SectionHeader } from "@/components/ui";
import { LEAGUE_NAME } from "@/config/site";
import { getDraftSummaries } from "@/lib/data";

export const dynamic = "force-static";

export const metadata = {
  title: `Drafts · ${LEAGUE_NAME}`,
  description:
    "Every rookie draft, plus a preview of the upcoming order with traded picks resolved.",
};

/**
 * Surfaces the most relevant rookie draft as the canonical Drafts landing —
 * no drill-in required. A draft the last ingest caught mid-run wins outright;
 * otherwise the most recent completed draft, and failing that any upcoming
 * one (whose page shows the projected order and hosts the live room). Older
 * drafts remain reachable via the year pills on the year page. If no draft
 * exists at all, render an empty state in place rather than redirecting
 * nowhere.
 */
export default async function DraftsIndexPage() {
  const summaries = await getDraftSummaries();
  const latest =
    summaries.find((s) => s.status === "drafting" || s.status === "paused") ??
    summaries.find((s) => s.status === "complete") ??
    summaries[0];

  if (latest) {
    redirect(`/drafts/${latest.season}`);
  }

  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-6 py-16">
      <SectionHeader
        kicker="No completed drafts"
        title="Drafts"
        description="Past rookie drafts will appear here as soon as the league has run one."
        size="lg"
      />
      <div className="mt-8">
        <EmptyState
          title="The draft hasn't been ratified"
          description="Past and upcoming rookie drafts appear here once Sleeper publishes them."
        />
      </div>
    </main>
  );
}
