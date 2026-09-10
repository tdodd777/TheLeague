import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LEAGUE_NAME } from "@/config/site";
import { getAllTrades } from "@/lib/data";

// Resolves to ../../page.tsx (the /transactions/trades index route), not to the
// sibling `page/` directory: module resolution tries file + extension before
// directory + index.
import TradesPage from "../../page";
import { tradesTotalPages } from "../../pageSize";

export const dynamic = "force-static";

/**
 * Only the page numbers enumerated by generateStaticParams exist. Anything else
 * 404s at the edge instead of booting a serverless render, which matters here:
 * this route reads committed JSON at build time, and a dynamic fallback would
 * pull the whole ~22MB data trace (18MB of it players.json) into a function.
 */
export const dynamicParams = false;

interface PageProps {
  params: Promise<{ page: string }>;
}

export async function generateStaticParams(): Promise<Array<{ page: string }>> {
  const trades = await getAllTrades();
  const totalPages = tradesTotalPages(trades.length);
  // Page 1 is enumerated so a hand-typed /page/1 resolves rather than 404s.
  // /transactions/trades stays its canonical URL, and the paginator links there.
  return Array.from({ length: totalPages }, (_, i) => ({
    page: String(i + 1),
  }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { page } = await params;
  const n = Number.parseInt(page, 10);
  return {
    title:
      n > 1
        ? `Trades · Page ${n} · ${LEAGUE_NAME}`
        : `Trades · ${LEAGUE_NAME}`,
    description:
      "Every trade in league history, with one-click drill-in to historical fairness.",
    alternates: {
      canonical:
        n > 1 ? `/transactions/trades/page/${n}` : "/transactions/trades",
    },
  };
}

export default async function TradesPagedPage({ params }: PageProps) {
  const { page } = await params;
  const n = Number.parseInt(page, 10);
  if (!Number.isInteger(n) || n < 1) notFound();

  return <TradesPage params={Promise.resolve({ page })} />;
}
