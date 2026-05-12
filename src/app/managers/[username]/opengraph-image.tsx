import { ImageResponse } from "next/og";

import { LEAGUE_NAME } from "@/config/site";
import { findManagerByUsername, getManagerCareer, getStandings, listCachedSeasons } from "@/lib/data";

export const alt = "Manager profile";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

interface Props {
  params: Promise<{ username: string }>;
}

export default async function OG({ params }: Props) {
  const { username } = await params;
  const found = await findManagerByUsername(username);
  if (!found) {
    return new ImageResponse(<div style={{ display: "flex" }}>Not found</div>, size);
  }
  const { manager } = found;
  const career = await getManagerCareer(manager.userId);

  const seasons = await listCachedSeasons();
  let lastFinish: { season: string; rank: number } | null = null;
  for (const s of seasons) {
    const standings = await getStandings(s);
    const row = standings.find((r) => r.manager.userId === manager.userId);
    if (!row) continue;
    if (row.wins + row.losses + row.ties === 0) continue;
    lastFinish = { season: s, rank: standings.indexOf(row) + 1 };
    break;
  }

  const w = career?.totals.wins ?? 0;
  const l = career?.totals.losses ?? 0;
  const t = career?.totals.ties ?? 0;

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
          {LEAGUE_NAME} · Manager
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 48, marginTop: 32 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={manager.avatarUrl}
            alt=""
            width={220}
            height={220}
            style={{ borderRadius: 9999, border: "4px solid #f5b54a" }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", fontSize: 80, fontWeight: 700, lineHeight: 1, letterSpacing: -2 }}>
              {manager.displayName}
            </div>
            <div style={{ display: "flex", fontSize: 28, color: "#a3a3a3" }}>@{manager.username}</div>
            <div style={{ display: "flex", gap: 28, marginTop: 16, fontSize: 30 }}>
              <span style={{ display: "flex", color: "#fafafa" }}>
                {w}-{l}{t ? `-${t}` : ""}
              </span>
              <span style={{ display: "flex", color: "#a3a3a3" }}>career record</span>
            </div>
            {lastFinish ? (
              <div style={{ display: "flex", fontSize: 24, color: "#a3a3a3" }}>
                {lastFinish.season} finish · #{lastFinish.rank}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
