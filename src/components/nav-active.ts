/**
 * Returns whether a nav link should be highlighted as the active section.
 *
 * Match by the first path segment so `/rankings/season` highlights the
 * "Rankings" link (whose href is `/rankings/dynasty`), and any
 * `/managers/*` route highlights "Managers". Home (`/`) requires an
 * exact pathname match.
 */
export function isActiveNav(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  const linkSeg = href.split("/")[1] ?? "";
  const pathSeg = pathname.split("/")[1] ?? "";
  return linkSeg !== "" && linkSeg === pathSeg;
}
