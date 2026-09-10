/**
 * Rows per page of the trade log.
 *
 * This lives in its own module because a Next `page` file may only export from
 * Next's known set (the generated type validator rejects anything else), so
 * neither route file can own the constant for the other. Three call sites read
 * it and they must agree: `generateStaticParams` in
 * ./page/[page]/page.tsx decides which pages exist, ../trades/page.tsx slices
 * the rows and renders the paginator links, and ../../sitemap.ts declares the
 * paged URLs. Because ./page/[page]/page.tsx sets `dynamicParams = false`, a
 * drift between them turns links the site renders itself into hard 404s.
 */
export const TRADES_PAGE_SIZE = 10;

/** Number of pages the trade log occupies. Always at least 1, so the empty
 * league still has a page 1 to render. */
export function tradesTotalPages(tradeCount: number): number {
  return Math.max(1, Math.ceil(tradeCount / TRADES_PAGE_SIZE));
}
