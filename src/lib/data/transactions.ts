import type {
  SleeperPlayer,
  SleeperTransaction,
  SleeperTransactionDraftPick,
} from "@/lib/sleeper";
import type { Manager } from "@/lib/types";

import { listCachedSeasons, readAllTransactions, readPlayers } from "./cache";
import { getManagers, type ManagerLookup } from "./managers";

export type FeedTxType = "trade" | "waiver" | "free_agent" | "commissioner";

export interface TxPlayer {
  playerId: string;
  name: string;
  position: string;
  team: string | null;
}

export interface TxPick {
  season: string;
  round: number;
  originalRosterId: number;
  originalManager: Manager | null;
}

export interface FeedTransactionPerRoster {
  manager: Manager;
  rosterId: number;
  adds: TxPlayer[];
  drops: TxPlayer[];
  picksReceived: TxPick[];
  faabReceived: number;
  /** For waiver claims: amount bid (sum of waiver_budget where receiver=this roster's owner). */
  waiverBid: number | null;
}

export interface FeedTransaction {
  transactionId: string;
  season: string;
  type: FeedTxType;
  status: SleeperTransaction["status"];
  statusUpdated: number;
  created: number;
  /** Per-roster breakdown of what each manager involved did. */
  parties: FeedTransactionPerRoster[];
  /** All players involved (used for client-side text search). */
  allPlayerNames: string[];
}

function playerName(p: SleeperPlayer | undefined, id: string): string {
  if (!p) return id;
  if (p.full_name) return p.full_name;
  if (p.first_name && p.last_name) return `${p.first_name} ${p.last_name}`;
  return id;
}

function playerPos(p: SleeperPlayer | undefined, id: string): string {
  if (p?.position) return p.position;
  if (id.length <= 3 && id === id.toUpperCase()) return "DEF";
  return "UNK";
}

function buildOne(
  tx: SleeperTransaction,
  season: string,
  managers: ManagerLookup,
  futureSeasonManagers: Map<string, ManagerLookup>,
  players: Record<string, SleeperPlayer>,
): FeedTransaction | null {
  if (tx.type === "commissioner") {
    return null; // not surfaced in the feed
  }
  if (tx.roster_ids.length === 0) return null;

  const partyMap = new Map<number, FeedTransactionPerRoster>();
  for (const rid of tx.roster_ids) {
    const m = managers.byRosterId.get(rid);
    if (!m) continue;
    partyMap.set(rid, {
      manager: m,
      rosterId: rid,
      adds: [],
      drops: [],
      picksReceived: [],
      faabReceived: 0,
      waiverBid: null,
    });
  }

  const adds = tx.adds ?? {};
  for (const [pid, rid] of Object.entries(adds)) {
    const p = partyMap.get(rid);
    if (!p) continue;
    const meta = players[pid];
    p.adds.push({
      playerId: pid,
      name: playerName(meta, pid),
      position: playerPos(meta, pid),
      team: meta?.team ?? null,
    });
  }
  const drops = tx.drops ?? {};
  for (const [pid, rid] of Object.entries(drops)) {
    const p = partyMap.get(rid);
    if (!p) continue;
    const meta = players[pid];
    p.drops.push({
      playerId: pid,
      name: playerName(meta, pid),
      position: playerPos(meta, pid),
      team: meta?.team ?? null,
    });
  }

  for (const pick of tx.draft_picks as SleeperTransactionDraftPick[]) {
    const recipient = partyMap.get(pick.owner_id);
    if (!recipient) continue;
    const futureLookup = futureSeasonManagers.get(pick.season);
    recipient.picksReceived.push({
      season: pick.season,
      round: pick.round,
      originalRosterId: pick.roster_id,
      originalManager:
        futureLookup?.byRosterId.get(pick.roster_id) ??
        managers.byRosterId.get(pick.roster_id) ??
        null,
    });
  }

  for (const wb of tx.waiver_budget ?? []) {
    const recipient = partyMap.get(wb.receiver);
    if (!recipient) continue;
    recipient.faabReceived += wb.amount;
  }

  // For waiver claims, settings.waiver_bid (amount paid). Apply to the
  // single roster involved.
  if (tx.type === "waiver" && partyMap.size === 1) {
    const bid = tx.settings?.["waiver_bid"];
    if (typeof bid === "number") {
      const only = [...partyMap.values()][0];
      if (only) only.waiverBid = bid;
    }
  }

  const parties = [...partyMap.values()].sort(
    (a, b) => a.rosterId - b.rosterId,
  );
  if (parties.length === 0) return null;

  const allPlayerNames = parties.flatMap((p) =>
    [...p.adds, ...p.drops].map((x) => x.name),
  );

  return {
    transactionId: tx.transaction_id,
    season,
    type: tx.type as FeedTxType,
    status: tx.status,
    statusUpdated: tx.status_updated,
    created: tx.created,
    parties,
    allPlayerNames,
  };
}

/**
 * Flat, sorted, fully-resolved transactions feed across every cached season.
 * Excludes failed waivers and commissioner moves.
 */
export async function getTransactionsFeed(): Promise<FeedTransaction[]> {
  const seasons = await listCachedSeasons();
  const players = await readPlayers();
  const seasonManagers = new Map<string, ManagerLookup>();
  for (const s of seasons) seasonManagers.set(s, await getManagers(s));

  const out: FeedTransaction[] = [];
  for (const s of seasons) {
    const txs = await readAllTransactions(s).catch(() => []);
    const managers = seasonManagers.get(s)!;
    for (const tx of txs) {
      if (tx.status !== "complete") continue;
      const feed = buildOne(tx, s, managers, seasonManagers, players);
      if (feed) out.push(feed);
    }
  }
  out.sort((a, b) => b.statusUpdated - a.statusUpdated);
  return out;
}
