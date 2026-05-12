import { ImageResponse } from "next/og";

import { LEAGUE_NAME } from "@/config/site";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

function leagueInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "L";
  if (words.length === 1) return (words[0] ?? "L").slice(0, 2).toUpperCase();
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase();
}

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0b",
          color: "#f5b54a",
          fontSize: 100,
          fontWeight: 700,
          letterSpacing: -4,
          fontFamily: "Georgia, serif",
        }}
      >
        {leagueInitials(LEAGUE_NAME)}
      </div>
    ),
    size,
  );
}
