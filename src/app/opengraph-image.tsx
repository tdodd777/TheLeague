import { ImageResponse } from "next/og";

import { LEAGUE_NAME, LEAGUE_TAGLINE, LEAGUE_YEAR } from "@/config/site";

export const alt = LEAGUE_NAME;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OG() {
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
          justifyContent: "space-between",
          padding: 80,
          fontFamily: "Georgia, serif",
        }}
      >
        <div
          style={{
            display: "flex",
            color: "#f5b54a",
            fontSize: 22,
            letterSpacing: 8,
            textTransform: "uppercase",
            fontFamily: "Helvetica, sans-serif",
          }}
        >
          {LEAGUE_YEAR} Season
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 24,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 160,
              fontWeight: 400,
              fontStyle: "italic",
              lineHeight: 0.95,
              letterSpacing: -4,
            }}
          >
            {LEAGUE_NAME}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 28,
              color: "#a3a3a3",
              maxWidth: 900,
              fontFamily: "Helvetica, sans-serif",
            }}
          >
            {LEAGUE_TAGLINE}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 16,
            color: "#71717a",
            letterSpacing: 4,
            textTransform: "uppercase",
            fontFamily: "Helvetica, sans-serif",
          }}
        >
          <span style={{ display: "flex" }}>Dynasty · Standings · Records</span>
          <span style={{ display: "flex" }}>Data via Sleeper + FantasyCalc</span>
        </div>
      </div>
    ),
    size,
  );
}
