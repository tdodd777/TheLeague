import { ImageResponse } from "next/og";

import { LEAGUE_NAME } from "@/config/site";
import { getAllTrades, readPlayers } from "@/lib/data";
import {
  buildPickAsset,
  buildPlayerAsset,
  getSnapshotClosestTo,
  resolveSnapshot,
} from "@/lib/rankings";

export const alt = "Trade summary";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function OG({ params }: Props) {
  const { id } = await params;
  const trades = await getAllTrades();
  const trade = trades.find((t) => t.transactionId === id);
  if (!trade) {
    return new ImageResponse(<div style={{ display: "flex" }}>Unknown trade</div>, size);
  }

  const players = await readPlayers();
  const { snapshot } = await getSnapshotClosestTo(trade.statusUpdated);
  const resolved = resolveSnapshot(snapshot, "dynasty");

  const totals = trade.sides.map((side) => {
    let total = 0;
    for (const p of side.players) {
      const a = buildPlayerAsset(p.playerId, resolved, players);
      total += a.value;
    }
    for (const pick of side.picks) {
      const a = buildPickAsset(
        { season: Number(pick.season), round: pick.round, slot: null },
        resolved,
      );
      total += a.value;
    }
    return total;
  });

  let winnerIdx = 0;
  for (let i = 1; i < totals.length; i++) {
    if (totals[i]! > totals[winnerIdx]!) winnerIdx = i;
  }
  const winner = trade.sides[winnerIdx]!;
  const loserIdx = winnerIdx === 0 ? 1 : 0;
  const loser = trade.sides[loserIdx];

  const winnerTotal = totals[winnerIdx] ?? 0;
  const loserTotal = totals[loserIdx] ?? 0;
  const sum = winnerTotal + loserTotal;
  const edgePct = sum > 0 ? Math.round(((winnerTotal - loserTotal) / sum) * 100) : 0;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#0a0a0b",
          color: "#fafafa",
          display: "flex",
          flexDirection: "column",
          padding: 64,
          fontFamily: "Helvetica, sans-serif",
        }}
      >
        <div style={{ display: "flex", color: "#f5b54a", fontSize: 18, letterSpacing: 6, textTransform: "uppercase" }}>
          {LEAGUE_NAME} · Trade
        </div>

        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 32, gap: 32 }}>
          <Side manager={winner.manager} pts={winnerTotal} edge="winner" />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 80, color: "#525252" }}>↔</div>
            <div style={{ display: "flex", fontSize: 26, color: "#f5b54a" }}>+{Math.abs(edgePct)}% edge</div>
            <div style={{ display: "flex", fontSize: 20, color: "#a3a3a3" }}>@{winner.manager.username}</div>
          </div>
          {loser ? <Side manager={loser.manager} pts={loserTotal} edge="loser" /> : null}
        </div>

        <div style={{ display: "flex", fontSize: 22, color: "#a3a3a3", marginTop: 16 }}>
          {trade.season} · dynasty values
        </div>
      </div>
    ),
    size,
  );
}

function Side({
  manager,
  pts,
  edge,
}: {
  manager: { displayName: string; username: string; avatarUrl: string };
  pts: number;
  edge: "winner" | "loser";
}) {
  const tone = edge === "winner" ? "#f5b54a" : "#525252";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, width: 320 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={manager.avatarUrl}
        alt=""
        width={180}
        height={180}
        style={{ borderRadius: 9999, border: `4px solid ${tone}` }}
      />
      <div style={{ display: "flex", fontSize: 36, fontWeight: 700, textAlign: "center", lineHeight: 1.1 }}>
        {manager.displayName}
      </div>
      <div style={{ display: "flex", fontSize: 22, color: "#a3a3a3" }}>{Math.round(pts).toLocaleString()} pts</div>
    </div>
  );
}
