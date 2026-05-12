import { ImageResponse } from "next/og";

import { buildDynastyRankings } from "@/lib/rankings";
import type { RosterValueBreakdown } from "@/lib/rankings";

export const alt = "Dynasty power rankings";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OG() {
  const ranking = await buildDynastyRankings();
  const top = ranking.rosters.slice(0, 3);

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
        <div
          style={{
            display: "flex",
            color: "#f5b54a",
            fontSize: 18,
            letterSpacing: 6,
            textTransform: "uppercase",
          }}
        >
          Dynasty Power · {ranking.season} · snapshot {ranking.snapshotDate}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 84,
            fontWeight: 700,
            lineHeight: 1,
            letterSpacing: -2,
            marginTop: 16,
          }}
        >
          Dynasty Rankings
        </div>
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: 18,
            marginTop: 24,
          }}
        >
          {top.length === 0 ? (
            <div
              style={{
                display: "flex",
                fontSize: 28,
                color: "#a3a3a3",
              }}
            >
              No snapshot available.
            </div>
          ) : (
            top.map((row, i) => (
              <Row
                key={row.rosterId}
                rank={i + 1}
                row={row}
                leagueAverage={ranking.leagueAverages.total}
              />
            ))
          )}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 18,
            color: "#71717a",
            letterSpacing: 4,
            textTransform: "uppercase",
          }}
        >
          League average · {ranking.leagueAverages.total.toLocaleString("en-US", { maximumFractionDigits: 0 })}
        </div>
      </div>
    ),
    size,
  );
}

function Row({
  rank,
  row,
  leagueAverage,
}: {
  rank: number;
  row: RosterValueBreakdown;
  leagueAverage: number;
}) {
  const rankColor = rank === 1 ? "#f5b54a" : rank === 2 ? "#d4d4d8" : "#b87333";
  const diff = row.total - leagueAverage;
  const diffPct = leagueAverage > 0 ? (diff / leagueAverage) * 100 : 0;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 24,
        background: "#111114",
        borderRadius: 16,
        padding: "16px 24px",
        border: "1px solid #27272a",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 56,
          height: 56,
          borderRadius: 9999,
          background: rankColor,
          color: "#0a0a0b",
          fontSize: 30,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {rank}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={row.manager.avatarUrl}
        alt=""
        width={64}
        height={64}
        style={{ borderRadius: 9999, border: "2px solid #27272a" }}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
        <div
          style={{
            display: "flex",
            fontSize: 32,
            fontWeight: 700,
            lineHeight: 1,
          }}
        >
          {row.manager.displayName}
        </div>
        <div style={{ display: "flex", fontSize: 18, color: "#71717a" }}>
          @{row.manager.username}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 4,
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 36,
            fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1,
          }}
        >
          {row.total.toLocaleString("en-US", { maximumFractionDigits: 0 })}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 18,
            color: diff >= 0 ? "#4ade80" : "#f87171",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {diff >= 0 ? "+" : "−"}{Math.abs(diffPct).toFixed(1)}% vs avg
        </div>
      </div>
    </div>
  );
}
