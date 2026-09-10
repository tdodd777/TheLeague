import { ImageResponse } from "next/og";

import { LEAGUE_NAME } from "@/config/site";
import { getManagers, readMatchups } from "@/lib/data";
import type { SleeperMatchup } from "@/lib/sleeper";

export const alt = "Week scoreboard";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

interface Props {
  params: Promise<{ season: string; week: string }>;
}

export default async function OG({ params }: Props) {
  const { season, week: weekStr } = await params;
  const week = Number.parseInt(weekStr, 10);
  const matchups = await readMatchups(season, week);
  if (!matchups || matchups.length === 0) {
    return new ImageResponse(
      <div style={{ display: "flex" }}>Week not cached</div>,
      size,
    );
  }
  const managers = await getManagers(season);

  // Headline = pair with highest combined score.
  const byId = new Map<number, SleeperMatchup[]>();
  for (const m of matchups) {
    const arr = byId.get(m.matchup_id) ?? [];
    arr.push(m);
    byId.set(m.matchup_id, arr);
  }
  let best: { a: SleeperMatchup; b: SleeperMatchup } | null = null;
  let bestCombined = -1;
  for (const list of byId.values()) {
    if (list.length !== 2) continue;
    const [x, y] = list as [SleeperMatchup, SleeperMatchup];
    const combined = x.points + y.points;
    if (combined > bestCombined) {
      bestCombined = combined;
      best = x.points >= y.points ? { a: x, b: y } : { a: y, b: x };
    }
  }
  if (!best) {
    return new ImageResponse(
      <div style={{ display: "flex" }}>No pairs</div>,
      size,
    );
  }
  const aMgr = managers.byRosterId.get(best.a.roster_id);
  const bMgr = managers.byRosterId.get(best.b.roster_id);
  if (!aMgr || !bMgr) {
    return new ImageResponse(
      <div style={{ display: "flex" }}>Managers not found</div>,
      size,
    );
  }

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
          {LEAGUE_NAME} · {season} · Week {week}
        </div>
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 32,
            marginTop: 24,
          }}
        >
          <Side manager={aMgr} score={best.a.points} winner={true} align="left" />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span
              style={{
                display: "flex",
                fontSize: 32,
                color: "#a3a3a3",
                letterSpacing: 4,
                textTransform: "uppercase",
              }}
            >
              vs
            </span>
            <span
              style={{
                display: "flex",
                fontSize: 18,
                color: "#71717a",
                letterSpacing: 3,
                textTransform: "uppercase",
              }}
            >
              margin {(best.a.points - best.b.points).toFixed(2)}
            </span>
          </div>
          <Side
            manager={bMgr}
            score={best.b.points}
            winner={false}
            align="right"
          />
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 22,
            color: "#71717a",
            letterSpacing: 4,
            textTransform: "uppercase",
          }}
        >
          Headline matchup · {bestCombined.toFixed(1)} combined
        </div>
      </div>
    ),
    size,
  );
}

function Side({
  manager,
  score,
  winner,
  align,
}: {
  manager: { displayName: string; username: string; avatarUrl: string };
  score: number;
  winner: boolean;
  align: "left" | "right";
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: align === "left" ? "flex-start" : "flex-end",
        gap: 16,
        flex: 1,
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
          fontSize: 38,
          fontWeight: 700,
          lineHeight: 1,
          letterSpacing: -1,
          color: winner ? "#fafafa" : "#a3a3a3",
          maxWidth: 380,
          textAlign: align === "left" ? "left" : "right",
        }}
      >
        {manager.displayName}
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 22,
          color: "#71717a",
        }}
      >
        @{manager.username}
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 96,
          fontWeight: 700,
          lineHeight: 1,
          letterSpacing: -3,
          color: winner ? "#fafafa" : "#a3a3a3",
          fontVariantNumeric: "tabular-nums",
          marginTop: 8,
        }}
      >
        {score.toFixed(2)}
      </div>
    </div>
  );
}
