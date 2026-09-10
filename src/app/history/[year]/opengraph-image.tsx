import { ImageResponse } from "next/og";

import { LEAGUE_NAME } from "@/config/site";
import { getManagers, getSeasonPlacements, getStandings, listCachedSeasons } from "@/lib/data";

export const alt = "Season recap";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

interface Props {
  params: Promise<{ year: string }>;
}

export default async function OG({ params }: Props) {
  const { year } = await params;
  const seasons = await listCachedSeasons();
  if (!seasons.includes(year)) {
    return new ImageResponse(<div style={{ display: "flex" }}>Unknown season</div>, size);
  }

  const placements = await getSeasonPlacements(year);
  const managers = await getManagers(year);
  const standings = await getStandings(year);
  const champ = placements.champion !== null ? managers.byRosterId.get(placements.champion) : null;
  const champRow = champ ? standings.find((s) => s.rosterId === champ.rosterId) : null;

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
          {LEAGUE_NAME} · Season {year}
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 56, marginTop: 32 }}>
          {champ ? (
            <div style={{ display: "flex", alignItems: "center", gap: 56 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={champ.avatarUrl}
                alt=""
                width={260}
                height={260}
                style={{ borderRadius: 9999, border: "5px solid #f5b54a" }}
              />
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", fontSize: 26, color: "#f5b54a", letterSpacing: 4, textTransform: "uppercase" }}>
                  Champion
                </div>
                <div style={{ display: "flex", fontSize: 92, fontWeight: 700, lineHeight: 1, letterSpacing: -2 }}>
                  {champ.displayName}
                </div>
                <div style={{ display: "flex", fontSize: 30, color: "#a3a3a3" }}>@{champ.username}</div>
                {champRow ? (
                  <div style={{ display: "flex", fontSize: 28, color: "#a3a3a3", marginTop: 12 }}>
                    {champRow.wins}-{champRow.losses}{champRow.ties ? `-${champRow.ties}` : ""} · {champRow.pf.toFixed(1)} PF
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", fontSize: 80, fontWeight: 700 }}>{year} season</div>
          )}
        </div>
      </div>
    ),
    size,
  );
}
