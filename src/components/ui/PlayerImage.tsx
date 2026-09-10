"use client";

import Image from "next/image";
import { useState } from "react";

import { cn } from "@/lib/cn";

interface PlayerImageProps {
  /** Sleeper player_id. For DSTs this is a team abbreviation (e.g. "PIT"). */
  playerId: string;
  /** Player position — used to pick the fallback color and decide DST routing. */
  position: string;
  /** Player display name — used for alt text and the initials fallback. */
  name: string;
  size?: number;
  className?: string;
  /** Background color of the fallback disc (defaults based on position). */
  fallbackColor?: string;
}

const SLEEPER_PLAYER_BASE = "https://sleepercdn.com/content/nfl/players";
const SLEEPER_TEAM_LOGO_BASE = "https://sleepercdn.com/images/team_logos/nfl";

function isDstId(playerId: string, position: string): boolean {
  if (position === "DEF") return true;
  return playerId.length <= 3 && playerId === playerId.toUpperCase();
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return (parts[0]?.slice(0, 2) ?? "?").toUpperCase();
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}

export function PlayerImage({
  playerId,
  position,
  name,
  size = 28,
  className,
  fallbackColor,
}: PlayerImageProps) {
  const [errored, setErrored] = useState(false);
  const isDst = isDstId(playerId, position);

  const src = isDst
    ? `${SLEEPER_TEAM_LOGO_BASE}/${playerId.toLowerCase()}.png`
    : `${SLEEPER_PLAYER_BASE}/${playerId}.jpg`;

  if (errored) {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full text-[9px] font-medium tabular text-background uppercase tracking-tight",
          className,
        )}
        style={{
          width: size,
          height: size,
          background: fallbackColor ?? "var(--foreground-subtle)",
        }}
        aria-label={name}
      >
        {initials(name)}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-block shrink-0 overflow-hidden rounded-full bg-foreground/[0.04]",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <Image
        src={src}
        alt={name}
        width={size}
        height={size}
        sizes={`${size}px`}
        onError={() => setErrored(true)}
        className={cn(
          "h-full w-full",
          isDst ? "object-contain p-0.5" : "object-cover",
        )}
      />
    </span>
  );
}
