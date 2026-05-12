import { ImageResponse } from "next/og";

import { LEAGUE_NAME } from "@/config/site";
import {
  getCurrentLeague,
  getStandings,
  listCachedSeasons,
} from "@/lib/data";
import type { SeasonStanding } from "@/lib/types";

export const alt = "Standings";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OG() {
  const { season: currentSeason, league } = await getCurrentLeague();
  const seasons = await listCachedSeasons();
  const currentHasResults =
    league.status === "in_season" || league.status === "complete";
  const fallback = currentHasResults
    ? null
    : (seasons.find((s) => s !== currentSeason) ?? null);
  const renderedSeason = currentHasResults
    ? currentSeason
    : (fallback ?? currentSeason);

  const standings = await getStandings(renderedSeason);
  const top: SeasonStanding[] = standings.slice(0, 3);
  const isFallback = !currentHasResults && renderedSeason !== currentSeason;

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
          {LEAGUE_NAME} · {renderedSeason} {isFallback ? "Final" : "Standings"}
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
          Standings
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
              No games played yet.
            </div>
          ) : (
            top.map((s, i) => (
              <Row key={s.rosterId} rank={i + 1} row={s} />
            ))
          )}
        </div>
      </div>
    ),
    size,
  );
}

function Row({ rank, row }: { rank: number; row: SeasonStanding }) {
  const rankColor = rank === 1 ? "#f5b54a" : rank === 2 ? "#d4d4d8" : "#b87333";
  const record = `${row.wins}-${row.losses}${row.ties ? `-${row.ties}` : ""}`;
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
            fontSize: 32,
            fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1,
          }}
        >
          {record}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 18,
            color: "#a3a3a3",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {row.pf.toFixed(1)} PF
        </div>
      </div>
    </div>
  );
}
