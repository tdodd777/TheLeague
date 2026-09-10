/**
 * Returns whether a nav link should be highlighted as the active section.
 *
 * Match by the first path segment so `/rankings/season` highlights the
 * "Rankings" link (whose href is `/rankings/dynasty`), and any
 * `/managers/*` route highlights "Managers". Home (`/`) requires an
 * exact pathname match.
 */
/**
 * Single source of truth for the primary nav. Previously duplicated verbatim in
 * `layout.tsx` and `MobileNav.tsx`, so adding a route meant editing two files.
 */
export const NAV_LINKS: ReadonlyArray<{ href: string; label: string }> = [
  { href: "/", label: "Home" },
  { href: "/standings", label: "Standings" },
  { href: "/managers", label: "Managers" },
  { href: "/rankings/dynasty", label: "Rankings" },
  { href: "/matchups", label: "Matchups" },
  { href: "/h2h", label: "H2H" },
  { href: "/records", label: "Records" },
  { href: "/history", label: "History" },
  { href: "/awards", label: "Awards" },
  { href: "/transactions", label: "Transactions" },
  { href: "/drafts", label: "Drafts" },
];

export function isActiveNav(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  const linkSeg = href.split("/")[1] ?? "";
  const pathSeg = pathname.split("/")[1] ?? "";
  return linkSeg !== "" && linkSeg === pathSeg;
}
