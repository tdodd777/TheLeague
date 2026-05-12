import { ImageResponse } from "next/og";

import { LEAGUE_NAME } from "@/config/site";

export const contentType = "image/png";

export function generateImageMetadata() {
  return [
    { id: "small", contentType: "image/png", size: { width: 192, height: 192 } },
    { id: "large", contentType: "image/png", size: { width: 512, height: 512 } },
  ];
}

function leagueInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "L";
  if (words.length === 1) return (words[0] ?? "L").slice(0, 2).toUpperCase();
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase();
}

export default function Icon({ id }: { id: string }) {
  const dim = id === "large" ? 512 : 192;
  const initials = leagueInitials(LEAGUE_NAME);
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
          fontSize: dim * 0.58,
          fontWeight: 700,
          letterSpacing: -dim * 0.02,
          fontFamily: "Georgia, serif",
        }}
      >
        {initials}
      </div>
    ),
    { width: dim, height: dim },
  );
}
