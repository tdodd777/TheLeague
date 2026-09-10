import type {
  SleeperLeague,
  SleeperPlayer,
  SleeperTransaction,
  SleeperTransactionDraftPick,
  SleeperWaiverBudgetMove,
} from "@/lib/sleeper";
import type { Manager } from "@/lib/types";

import { listCachedSeasons, readAllTransactions, readLeague, readPlayers } from "./cache";
import { getManagers, type ManagerLookup } from "./managers";

export interface TradePickAsset {
  /** Draft year. */
  season: string;
  /** Round number. */
  round: number;
  /**
   * roster_id of the original owner expressed in the pick's own draft season,
   * carried forward by user_id. This is the id that lines up with that
   * season's draft order, so it is the one to join on for pick value.
   */
  originalRosterId: number;
  /**
   * roster_id exactly as the transaction recorded it. Scoped to the season the
   * trade happened in, so it is only meaningful against that season's rosters.
   */
  originalRosterIdAtTrade: number;
  /** Stable Sleeper user_id of the manager who owned the pick when it was traded. */
  originalUserId: string | null;
  /** Manager who owned the pick at the time of the trade. */
  originalManager: Manager | null;
}

export interface TradedPickOrigin {
  /** Stable Sleeper user_id of the owner at transaction time. */
  userId: string | null;
  /** Manager who owned the pick when the transaction happened. */
  manager: Manager | null;
  /** roster_id as written in the transaction (scoped to the transaction's season). */
  rosterIdAtTransaction: number;
  /** The same manager's roster_id in the season the pick fires in. */
  rosterIdInPickSeason: number;
}

/**
 * Work out who a traded draft pick originally belonged to.
 *
 * Sleeper roster_ids are scoped to one season's league, so `pick.roster_id`
 * only means anything against the rosters of the season the transaction
 * happened in. Reading it against the pick's own season names whoever holds
 * that number later, which can be a different person entirely: roster 2 can
 * belong to one manager in 2025 and someone else in 2026.
 *
 * So resolve the owner in the transaction's own season, then carry that
 * manager's stable user_id forward to find their roster_id in the season the
 * pick fires in. Falls back to the raw roster_id when the pick's season is not
 * cached yet or the manager has since left the league.
 */
export function resolvePickOrigin(
  pick: SleeperTransactionDraftPick,
  transactionSeasonManagers: ManagerLookup,
  managersBySeason: Map<string, ManagerLookup>,
): TradedPickOrigin {
  const owner =
    transactionSeasonManagers.byRosterId.get(pick.roster_id) ?? null;
  const pickSeasonManagers = managersBySeason.get(pick.season);
  const sameManagerLater = owner
    ? pickSeasonManagers?.byUserId.get(owner.userId)
    : undefined;
  return {
    userId: owner?.userId ?? null,
    manager: owner,
    rosterIdAtTransaction: pick.roster_id,
    rosterIdInPickSeason: sameManagerLater?.rosterId ?? pick.roster_id,
  };
}

export interface TradePlayerAsset {
  playerId: string;
  name: string;
  position: string;
  team: string | null;
}

export interface TradeFaabAsset {
  amount: number;
}

export interface TradeSide {
  manager: Manager;
  rosterId: number;
  players: TradePlayerAsset[];
  picks: TradePickAsset[];
  faab: TradeFaabAsset[];
  /** Quick asset count: players + picks + faab transfers. */
  assetCount: number;
}

export interface ResolvedTrade {
  transactionId: string;
  /** League season the trade happened in (e.g. "2024"). */
  season: string;
  /** Sleeper status_updated (ms). */
  statusUpdated: number;
  /** Sleeper created (ms). */
  created: number;
  status: SleeperTransaction["status"];
  /** Each side of the trade, one entry per roster involved. */
  sides: TradeSide[];
  /** Total assets across all sides — used to rank "biggest". */
  assetCount: number;
}

function playerName(p: SleeperPlayer | undefined, id: string): string {
  if (!p) return id;
  if (p.full_name) return p.full_name;
  if (p.first_name && p.last_name) return `${p.first_name} ${p.last_name}`;
  return id;
}

function playerPosition(p: SleeperPlayer | undefined, id: string): string {
  if (p?.position) return p.position;
  if (id.length <= 3 && id === id.toUpperCase()) return "DEF";
  return "UNK";
}

interface ResolveOpts {
  season: string;
  managers: ManagerLookup;
  players: Record<string, SleeperPlayer>;
  /** Manager lookups per cached season, used to carry pick owners across seasons. */
  managersBySeason: Map<string, ManagerLookup>;
}

function resolveOne(
  tx: SleeperTransaction,
  opts: ResolveOpts,
): ResolvedTrade | null {
  if (tx.type !== "trade") return null;
  if (tx.roster_ids.length === 0) return null;

  const sideByRoster = new Map<number, TradeSide>();
  for (const rosterId of tx.roster_ids) {
    const manager = opts.managers.byRosterId.get(rosterId);
    if (!manager) continue;
    sideByRoster.set(rosterId, {
      manager,
      rosterId,
      players: [],
      picks: [],
      faab: [],
      assetCount: 0,
    });
  }
  if (sideByRoster.size === 0) return null;

  // adds: player → roster receiving the player.
  const adds = tx.adds ?? {};
  for (const [playerId, rosterId] of Object.entries(adds)) {
    const side = sideByRoster.get(rosterId);
    if (!side) continue;
    const meta = opts.players[playerId];
    side.players.push({
      playerId,
      name: playerName(meta, playerId),
      position: playerPosition(meta, playerId),
      team: meta?.team ?? null,
    });
  }

  // draft_picks: each lists owner_id (new owner) — the receiver.
  for (const pick of tx.draft_picks as SleeperTransactionDraftPick[]) {
    const side = sideByRoster.get(pick.owner_id);
    if (!side) continue;
    const origin = resolvePickOrigin(pick, opts.managers, opts.managersBySeason);
    side.picks.push({
      season: pick.season,
      round: pick.round,
      originalRosterId: origin.rosterIdInPickSeason,
      originalRosterIdAtTrade: origin.rosterIdAtTransaction,
      originalUserId: origin.userId,
      originalManager: origin.manager,
    });
  }

  // waiver_budget moves on a trade transaction: receiver gets the FAAB.
  for (const wb of tx.waiver_budget as SleeperWaiverBudgetMove[]) {
    const side = sideByRoster.get(wb.receiver);
    if (!side) continue;
    side.faab.push({ amount: wb.amount });
  }

  let totalAssets = 0;
  for (const side of sideByRoster.values()) {
    side.assetCount = side.players.length + side.picks.length + side.faab.length;
    totalAssets += side.assetCount;
  }

  return {
    transactionId: tx.transaction_id,
    season: opts.season,
    statusUpdated: tx.status_updated,
    created: tx.created,
    status: tx.status,
    sides: [...sideByRoster.values()].sort((a, b) => a.rosterId - b.rosterId),
    assetCount: totalAssets,
  };
}

/**
 * All trades across every cached season, fully resolved with manager + player
 * + pick metadata. Sorted most-recent first.
 */
export async function getAllTrades(): Promise<ResolvedTrade[]> {
  const seasons = await listCachedSeasons();
  const players = await readPlayers();
  const managersBySeason = new Map<string, ManagerLookup>();
  for (const s of seasons) managersBySeason.set(s, await getManagers(s));

  const out: ResolvedTrade[] = [];
  for (const season of seasons) {
    const txs = await readAllTransactions(season).catch(() => []);
    const managers = managersBySeason.get(season)!;
    for (const tx of txs) {
      if (tx.type !== "trade") continue;
      if (tx.status !== "complete") continue;
      const resolved = resolveOne(tx, {
        season,
        managers,
        players,
        managersBySeason,
      });
      if (resolved) out.push(resolved);
    }
  }
  out.sort((a, b) => b.statusUpdated - a.statusUpdated);
  return out;
}

export async function getSeasonTrades(season: string): Promise<ResolvedTrade[]> {
  const all = await getAllTrades();
  return all.filter((t) => t.season === season);
}

/** Find a single trade by transaction_id. Returns null if not found. */
export async function getTradeById(
  transactionId: string,
): Promise<ResolvedTrade | null> {
  const all = await getAllTrades();
  return all.find((t) => t.transactionId === transactionId) ?? null;
}

export interface BiggestTradeSummary {
  trade: ResolvedTrade;
  /** Names of the rosters involved. */
  participants: Manager[];
}

export async function getBiggestTradeOfSeason(
  season: string,
): Promise<BiggestTradeSummary | null> {
  const trades = await getSeasonTrades(season);
  if (trades.length === 0) return null;
  const top = trades.reduce((a, b) =>
    b.assetCount > a.assetCount ||
    (b.assetCount === a.assetCount && b.statusUpdated > a.statusUpdated)
      ? b
      : a,
  );
  return {
    trade: top,
    participants: top.sides.map((s) => s.manager),
  };
}

/**
 * Manager-friendly summary of a trade for inline rendering in feeds. Renders
 * each side as "@user gets X, picks". For wider use in the trade detail page,
 * read sides directly off ResolvedTrade.
 */
export function summarizeSides(trade: ResolvedTrade): string {
  return trade.sides
    .map((s) => {
      const players = s.players.map((p) => p.name).join(", ");
      const picks = s.picks
        .map((p) => `${p.season} R${p.round}`)
        .join(", ");
      const items = [players, picks].filter(Boolean).join(" + ");
      return `@${s.manager.username}: ${items || "—"}`;
    })
    .join("  ↔  ");
}

/** Convenience: read the league for the season (used by the trade detail page). */
export async function readLeagueForSeason(
  season: string,
): Promise<SleeperLeague> {
  return readLeague(season);
}
