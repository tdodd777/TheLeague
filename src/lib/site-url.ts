/**
 * Single source of truth for the site's absolute origin. Everything that emits
 * absolute URLs (metadataBase for OG images, robots.txt, sitemap.xml) must
 * import this, robots and sitemap once carried their own copy of the fallback
 * chain, missed the Netlify fix that metadataBase got, and shipped
 * `http://localhost:3000` URLs to production.
 *
 * Resolution: explicit `SITE_URL` override, then Netlify's `URL` (always the
 * production origin, set on every Netlify build), then Vercel's `VERCEL_URL`
 * (a bare host with no protocol, so `https://` is prepended here), then
 * localhost as a last resort.
 *
 * Forkers: set `SITE_URL` in your deploy environment. Without it, OG images
 * and the sitemap fall back to `http://localhost:3000` on any host this file
 * does not already recognize, which is wrong in production. See SETUP.md.
 */
export const SITE_URL =
  process.env["SITE_URL"] ??
  process.env["URL"] ??
  (process.env["VERCEL_URL"]
    ? `https://${process.env["VERCEL_URL"]}`
    : undefined) ??
  "http://localhost:3000";
