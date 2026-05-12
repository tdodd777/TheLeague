import { getAllTrades, type ResolvedTrade } from "./trades";
import { getTransactionsFeed } from "./transactions";

export interface ManagerTradeStats {
  userId: string;
  trades: number;
  partners: number;
  playersReceived: number;
  playersGiven: number;
  picksReceived: number;
  picksGiven: number;
  faabReceived: number;
  faabGiven: number;
  /** assets received minus assets given (players + picks). */
  netAssets: number;
}

function sideForUser(trade: ResolvedTrade, userId: string) {
  return trade.sides.find((s) => s.manager.userId === userId) ?? null;
}

export async function getManagerTradeStats(
  userId: string,
): Promise<ManagerTradeStats> {
  const trades = await getAllTrades();
  const involved = trades.filter((t) =>
    t.sides.some((s) => s.manager.userId === userId),
  );

  const partners = new Set<string>();
  let playersReceived = 0;
  let playersGiven = 0;
  let picksReceived = 0;
  let picksGiven = 0;
  let faabReceived = 0;
  let faabGiven = 0;

  for (const trade of involved) {
    const me = sideForUser(trade, userId);
    if (!me) continue;
    playersReceived += me.players.length;
    picksReceived += me.picks.length;
    faabReceived += me.faab.reduce((s, f) => s + f.amount, 0);

    for (const other of trade.sides) {
      if (other.manager.userId === userId) continue;
      partners.add(other.manager.userId);
      playersGiven += other.players.length;
      picksGiven += other.picks.length;
      faabGiven += other.faab.reduce((s, f) => s + f.amount, 0);
    }
  }

  return {
    userId,
    trades: involved.length,
    partners: partners.size,
    playersReceived,
    playersGiven,
    picksReceived,
    picksGiven,
    faabReceived,
    faabGiven,
    netAssets:
      playersReceived + picksReceived - (playersGiven + picksGiven),
  };
}

export interface ManagerTransactionStats {
  userId: string;
  trades: number;
  waivers: number;
  freeAgents: number;
  faabSpent: number;
}

export async function getManagerTransactionStats(
  userId: string,
): Promise<ManagerTransactionStats> {
  const feed = await getTransactionsFeed();
  let trades = 0;
  let waivers = 0;
  let freeAgents = 0;
  let faabSpent = 0;

  for (const tx of feed) {
    const party = tx.parties.find((p) => p.manager.userId === userId);
    if (!party) continue;
    if (tx.type === "trade") trades += 1;
    else if (tx.type === "waiver") {
      waivers += 1;
      if (typeof party.waiverBid === "number") faabSpent += party.waiverBid;
    } else if (tx.type === "free_agent") freeAgents += 1;
  }

  return { userId, trades, waivers, freeAgents, faabSpent };
}
