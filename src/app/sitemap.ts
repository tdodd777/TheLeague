import type { MetadataRoute } from "next";

import {
  getAllTrades,
  getCurrentLeague,
  getManagers,
  listCachedSeasons,
} from "@/lib/data";
import { SITE_URL } from "@/lib/site-url";

import { tradesTotalPages } from "./transactions/trades/pageSize";

const STATIC_ROUTES: ReadonlyArray<string> = [
  "/",
  "/standings",
  "/managers",
  "/rankings/dynasty",
  "/rankings/season",
  "/rankings/quadrant",
  "/rankings/trend",
  "/h2h",
  "/matchups",
  "/constitution",
  "/records",
  "/history",
  "/awards",
  "/transactions",
  "/transactions/trades",
  "/drafts",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const entries: MetadataRoute.Sitemap = STATIC_ROUTES.map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: path === "/" ? 1 : 0.7,
  }));

  try {
    const { season } = await getCurrentLeague();
    const managers = await getManagers(season);
    for (const m of managers.list) {
      entries.push({
        url: `${SITE_URL}/managers/${m.username}`,
        lastModified: now,
        changeFrequency: "weekly",
        priority: 0.6,
      });
    }

    // Paged trade log. Page 2 up: page 1 is already declared above as
    // /transactions/trades, which is also what /page/1 sets as its canonical,
    // so listing it twice would advertise a duplicate. Derived from the same
    // page size the routes use so the sitemap can't outlive the page count.
    const trades = await getAllTrades();
    for (let p = 2; p <= tradesTotalPages(trades.length); p += 1) {
      entries.push({
        url: `${SITE_URL}/transactions/trades/page/${p}`,
        lastModified: now,
        changeFrequency: "weekly",
        priority: 0.5,
      });
    }

    const seasons = await listCachedSeasons();
    for (const s of seasons) {
      entries.push({
        url: `${SITE_URL}/history/${s}`,
        lastModified: now,
        changeFrequency: "monthly",
        priority: 0.5,
      });
      entries.push({
        url: `${SITE_URL}/drafts/${s}`,
        lastModified: now,
        changeFrequency: "yearly",
        priority: 0.4,
      });
    }
  } catch {
    // If data layer can't resolve at build time (e.g. local dev without
    // ingested data), fall back to the static set rather than failing the
    // sitemap route.
  }

  return entries;
}
