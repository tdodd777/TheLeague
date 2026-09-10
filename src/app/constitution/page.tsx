import type { Metadata } from "next";

import { SectionHeader } from "@/components/ui";
import Constitution from "@/config/constitution.mdx";
import { LEAGUE_NAME } from "@/config/site";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: `Constitution · ${LEAGUE_NAME}`,
  description: "League rules, scoring, dues, and tiebreakers.",
};

export default function ConstitutionPage() {
  return (
    <main className="relative">
      <section className="relative overflow-hidden border-b border-border">
        <div className="relative mx-auto max-w-3xl px-4 sm:px-6 pt-10 pb-10 sm:pt-14 sm:pb-12">
          <SectionHeader
            kicker="Rulebook"
            title="Constitution"
            description="The agreed-upon law of the land."
            size="lg"
          />
        </div>
      </section>
      <article className="mx-auto max-w-3xl px-4 sm:px-6 mt-8 mb-16 prose-none">
        <Constitution />
      </article>
    </main>
  );
}
