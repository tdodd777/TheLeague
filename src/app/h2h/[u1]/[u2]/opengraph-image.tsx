import { ImageResponse } from "next/og";

import { buildH2HMatrix, findManagerByUsername } from "@/lib/data";

export const alt = "Head-to-head rivalry";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

interface Props {
  params: Promise<{ u1: string; u2: string }>;
}

export default async function OG({ params }: Props) {
  const { u1, u2 } = await params;
  const [a, b] = await Promise.all([
    findManagerByUsername(u1),
    findManagerByUsername(u2),
  ]);
  if (!a || !b || a.manager.userId === b.manager.userId) {
    return new ImageResponse(
      <div style={{ display: "flex" }}>Unknown rivalry</div>,
      size,
    );
  }

  const matrix = await buildH2HMatrix();
  const cell = matrix.cells.get(a.manager.userId)?.get(b.manager.userId) ?? null;
  if (!cell) {
    return new ImageResponse(
      <div style={{ display: "flex" }}>No meetings</div>,
      size,
    );
  }

  const total = cell.wins + cell.losses + cell.ties;
  const winPct = total > 0 ? ((cell.wins + cell.ties * 0.5) / total) * 100 : 0;
  const ppg = total > 0 ? cell.pf / total : 0;
  const oppPpg = total > 0 ? cell.pa / total : 0;
  const aLeads = cell.wins > cell.losses;
  const recordStr = `${cell.wins}-${cell.losses}${cell.ties ? `-${cell.ties}` : ""}`;

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
          Rivalry · {total} {total === 1 ? "meeting" : "meetings"}
        </div>
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 24,
            marginTop: 16,
          }}
        >
          <Side
            manager={a.manager}
            winner={aLeads}
            align="left"
            stat={`${ppg.toFixed(1)} PF/g`}
          />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 12,
            }}
          >
            <span
              style={{
                display: "flex",
                fontSize: 24,
                color: "#a3a3a3",
                letterSpacing: 4,
                textTransform: "uppercase",
              }}
            >
              from @{a.manager.username}
            </span>
            <span
              style={{
                display: "flex",
                fontSize: 92,
                fontWeight: 700,
                lineHeight: 1,
                letterSpacing: -2,
                fontVariantNumeric: "tabular-nums",
                color: "#fafafa",
              }}
            >
              {recordStr}
            </span>
            <span
              style={{
                display: "flex",
                fontSize: 22,
                color: "#71717a",
                letterSpacing: 3,
                textTransform: "uppercase",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {winPct.toFixed(1)}% win rate
            </span>
          </div>
          <Side
            manager={b.manager}
            winner={!aLeads && cell.wins !== cell.losses}
            align="right"
            stat={`${oppPpg.toFixed(1)} PF/g`}
          />
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 22,
            color: "#71717a",
            letterSpacing: 4,
            textTransform: "uppercase",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          PF {cell.pf.toFixed(0)} · PA {cell.pa.toFixed(0)}
        </div>
      </div>
    ),
    size,
  );
}

function Side({
  manager,
  winner,
  align,
  stat,
}: {
  manager: { displayName: string; username: string; avatarUrl: string };
  winner: boolean;
  align: "left" | "right";
  stat: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: align === "left" ? "flex-start" : "flex-end",
        gap: 14,
        flex: 1,
        maxWidth: 360,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={manager.avatarUrl}
        alt=""
        width={140}
        height={140}
        style={{
          borderRadius: 9999,
          border: winner ? "4px solid #f5b54a" : "4px solid #27272a",
        }}
      />
      <div
        style={{
          display: "flex",
          fontSize: 36,
          fontWeight: 700,
          lineHeight: 1,
          letterSpacing: -1,
          color: winner ? "#fafafa" : "#a3a3a3",
          textAlign: align === "left" ? "left" : "right",
        }}
      >
        {manager.displayName}
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 20,
          color: "#71717a",
        }}
      >
        @{manager.username}
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 22,
          color: "#a3a3a3",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {stat}
      </div>
    </div>
  );
}
