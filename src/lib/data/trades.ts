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
  /** roster_id of the original owner — its slot determines the pick value. */
  originalRosterId: number;
  /** Manager who originally owned the pick (from the season the pick fires in). */
  originalManager: Manager | null;
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
  /** Manager lookups for the seasons in which traded picks fire (for "originally owned by"). */
  futureSeasonManagers?: Map<string, ManagerLookup>;
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
    const futureLookup = opts.futureSeasonManagers?.get(pick.season);
    const originalManager =
      futureLookup?.byRosterId.get(pick.roster_id) ??
      opts.managers.byRosterId.get(pick.roster_id) ??
      null;
    side.picks.push({
      season: pick.season,
      round: pick.round,
      originalRosterId: pick.roster_id,
      originalManager,
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
  const futureSeasonManagers = new Map<string, ManagerLookup>();
  for (const s of seasons) futureSeasonManagers.set(s, await getManagers(s));

  const out: ResolvedTrade[] = [];
  for (const season of seasons) {
    const txs = await readAllTransactions(season).catch(() => []);
    const managers = futureSeasonManagers.get(season)!;
    for (const tx of txs) {
      if (tx.type !== "trade") continue;
      if (tx.status !== "complete") continue;
      const resolved = resolveOne(tx, {
        season,
        managers,
        players,
        futureSeasonManagers,
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
