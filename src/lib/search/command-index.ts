import {
  getCurrentLeague,
  getManagers,
  listCachedMatchupWeeks,
  listCachedSeasons,
  readPlayers,
  readRosters,
} from "@/lib/data";

export type CommandKind = "page" | "manager" | "season" | "player" | "matchup";

export interface CommandItem {
  id: string;
  kind: CommandKind;
  label: string;
  sub?: string;
  href: string;
  /** Concatenated lowercase haystack used for fuzzy matching. */
  haystack: string;
}

const STATIC_PAGES: ReadonlyArray<Omit<CommandItem, "haystack">> = [
  { id: "page:home", kind: "page", label: "Home", href: "/" },
  { id: "page:standings", kind: "page", label: "Standings", href: "/standings" },
  { id: "page:managers", kind: "page", label: "Managers", href: "/managers" },
  { id: "page:rankings/dynasty", kind: "page", label: "Dynasty rankings", href: "/rankings/dynasty" },
  { id: "page:rankings/season", kind: "page", label: "Season power rankings", href: "/rankings/season" },
  { id: "page:rankings/quadrant", kind: "page", label: "Contender quadrant", href: "/rankings/quadrant" },
  { id: "page:rankings/trend", kind: "page", label: "Rankings trend", href: "/rankings/trend" },
  { id: "page:h2h", kind: "page", label: "Head-to-head", href: "/h2h" },
  { id: "page:matchups", kind: "page", label: "Matchups", href: "/matchups" },
  { id: "page:constitution", kind: "page", label: "Constitution", href: "/constitution" },
  { id: "page:records", kind: "page", label: "Records", href: "/records" },
  { id: "page:history", kind: "page", label: "History", href: "/history" },
  { id: "page:awards", kind: "page", label: "Awards", href: "/awards" },
  { id: "page:transactions", kind: "page", label: "Transactions", href: "/transactions" },
  { id: "page:transactions/trades", kind: "page", label: "Trades", href: "/transactions/trades" },
  { id: "page:drafts", kind: "page", label: "Drafts", href: "/drafts" },
];

let cachedCore: CommandItem[] | null = null;
let cachedPlayers: CommandItem[] | null = null;

/**
 * Pages, managers, seasons, and matchup weeks. Small enough (~80 items) to
 * embed in the root layout's HTML payload — this is what powers the empty
 * state of the command palette.
 */
export async function getCommandCoreIndex(): Promise<CommandItem[]> {
  if (cachedCore) return cachedCore;

  const items: CommandItem[] = [];

  for (const p of STATIC_PAGES) {
    items.push({ ...p, haystack: `${p.label} ${p.href}`.toLowerCase() });
  }

  const { season } = await getCurrentLeague();
  const managers = await getManagers(season);
  for (const m of managers.list) {
    items.push({
      id: `manager:${m.userId}`,
      kind: "manager",
      label: m.displayName,
      sub: `@${m.username}`,
      href: `/managers/${m.username}`,
      haystack: `${m.displayName} ${m.username}`.toLowerCase(),
    });
  }

  const matchupWeeks = await listCachedMatchupWeeks();
  for (const { season: s, weeks } of matchupWeeks) {
    for (const w of weeks) {
      const ww = String(w).padStart(2, "0");
      items.push({
        id: `matchup:${s}:${ww}`,
        kind: "matchup",
        label: `${s} Week ${w}`,
        sub: "matchups",
        href: `/matchups/${s}/${ww}`,
        haystack: `${s} week ${w} matchups`.toLowerCase(),
      });
    }
  }

  const seasons = await listCachedSeasons();
  for (const s of seasons) {
    items.push({
      id: `season:history:${s}`,
      kind: "season",
      label: `${s} season`,
      sub: "history + standings",
      href: `/history/${s}`,
      haystack: `${s} history season`.toLowerCase(),
    });
    items.push({
      id: `season:draft:${s}`,
      kind: "season",
      label: `${s} draft`,
      sub: "draft board",
      href: `/drafts/${s}`,
      haystack: `${s} draft`.toLowerCase(),
    });
  }

  cachedCore = items;
  return items;
}

/**
 * Top ~500 NFL players. Heavy (~80 KiB serialized) so we serve this from a
 * dedicated route handler and fetch on first palette open instead of
 * embedding it in every page's HTML.
 */
export async function getCommandPlayerIndex(): Promise<CommandItem[]> {
  if (cachedPlayers) return cachedPlayers;

  const { season } = await getCurrentLeague();
  const managers = await getManagers(season);
  const players = await readPlayers();
  const rosters = await readRosters(season);

  const ownerByPlayer = new Map<string, number>();
  for (const r of rosters) {
    if (!r.players || !r.owner_id) continue;
    for (const pid of r.players) ownerByPlayer.set(pid, r.roster_id);
  }
  const PRIMARY = new Set(["QB", "RB", "WR", "TE"]);
  type Cand = {
    id: string;
    name: string;
    pos: string;
    team: string | null;
    rostered: boolean;
    exp: number;
  };
  const candidates: Cand[] = [];
  for (const [id, p] of Object.entries(players)) {
    const pos = p.position;
    if (!pos || !PRIMARY.has(pos)) continue;
    if (!p.full_name) continue;
    const rostered = ownerByPlayer.has(id);
    if (!rostered) {
      if (p.status && p.status !== "Active") continue;
      if (!p.team) continue;
    }
    candidates.push({
      id,
      name: p.full_name,
      pos,
      team: p.team,
      rostered,
      exp: p.years_exp ?? 0,
    });
  }
  candidates.sort((a, b) => {
    if (a.rostered !== b.rostered) return a.rostered ? -1 : 1;
    return b.exp - a.exp;
  });
  const top = candidates.slice(0, 500);

  const items: CommandItem[] = [];
  for (const p of top) {
    const ownerRoster = ownerByPlayer.get(p.id);
    const owner =
      ownerRoster !== undefined ? managers.byRosterId.get(ownerRoster) : undefined;
    const href = owner ? `/managers/${owner.username}` : `/managers`;
    items.push({
      id: `player:${p.id}`,
      kind: "player",
      label: p.name,
      sub: `${p.pos}${p.team ? ` · ${p.team}` : ""}${owner ? ` · @${owner.username}` : ""}`,
      href,
      haystack: `${p.name} ${p.pos} ${p.team ?? ""} ${owner?.username ?? ""}`.toLowerCase(),
    });
  }

  cachedPlayers = items;
  return items;
}
