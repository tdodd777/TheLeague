"use client";

import Link from "next/link";
import { useState } from "react";

import { ManagerAvatar } from "@/components/ui";
import type { Manager } from "@/lib/types";

export interface H2HMobileOpponent {
  manager: Manager;
  wins: number;
  losses: number;
  ties: number;
  games: number;
  pct: number | null;
}

export interface H2HMobileManager {
  manager: Manager;
  opponents: H2HMobileOpponent[];
}

/**
 * Phone view for head-to-head. The 13x13 matrix needs 865px in a 356px
 * container (2.4 screens of horizontal panning) and slices names to seven
 * characters, so below `lg` we answer the question people actually open this
 * page for: "how do I do against each owner?" One manager at a time, sorted
 * by winning percentage, full names, no panning.
 */
export function H2HMobileList({ managers }: { managers: H2HMobileManager[] }) {
  const [selectedId, setSelectedId] = useState(
    managers[0]?.manager.userId ?? "",
  );
  const selected =
    managers.find((m) => m.manager.userId === selectedId) ??
    managers[0] ??
    null;
  if (!selected) return null;

  const played = selected.opponents.filter((o) => o.games > 0);
  const best = played[0] ?? null;
  const worst = played.length > 1 ? played[played.length - 1] : null;

  return (
    <div className="lg:hidden flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] uppercase tracking-[0.18em] text-foreground-subtle">
          Show record for
        </span>
        <select
          value={selected.manager.userId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="min-h-11 w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground"
        >
          {managers.map((m) => (
            <option key={m.manager.userId} value={m.manager.userId}>
              {m.manager.displayName}
            </option>
          ))}
        </select>
      </label>

      {best && worst && best.pct !== null && worst.pct !== null ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border bg-surface px-3 py-2.5 flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-[0.16em] text-foreground-subtle">
              Owns
            </span>
            <span className="font-display italic text-[17px] text-foreground leading-tight">
              {best.manager.displayName}
            </span>
            <span className="text-[11px] tabular text-positive">
              {best.wins}-{best.losses}
              {best.ties ? `-${best.ties}` : ""} · {(best.pct * 100).toFixed(0)}%
            </span>
          </div>
          <div className="rounded-lg border border-border bg-surface px-3 py-2.5 flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-[0.16em] text-foreground-subtle">
              Owned by
            </span>
            <span className="font-display italic text-[17px] text-foreground leading-tight">
              {worst.manager.displayName}
            </span>
            <span className="text-[11px] tabular text-negative">
              {worst.wins}-{worst.losses}
              {worst.ties ? `-${worst.ties}` : ""} ·{" "}
              {(worst.pct * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      ) : null}

      <ul className="flex flex-col border-t border-rule">
        {selected.opponents.map((o) => {
          const hasGames = o.games > 0;
          const body = (
            <>
              <ManagerAvatar manager={o.manager} size={28} ring="subtle" />
              <span className="flex-1 min-w-0 text-sm text-foreground">
                {o.manager.displayName}
              </span>
              {hasGames ? (
                <>
                  <span className="tabular text-sm text-foreground shrink-0">
                    {o.wins}-{o.losses}
                    {o.ties ? `-${o.ties}` : ""}
                  </span>
                  <span
                    className={`tabular text-[11px] w-11 text-right shrink-0 ${
                      o.pct === null
                        ? "text-foreground-subtle"
                        : o.pct > 0.5
                          ? "text-positive"
                          : o.pct < 0.5
                            ? "text-negative"
                            : "text-foreground-subtle"
                    }`}
                  >
                    {o.pct !== null ? `${(o.pct * 100).toFixed(0)}%` : ""}
                  </span>
                </>
              ) : (
                <span className="text-[11px] text-foreground-subtle shrink-0">
                  never played
                </span>
              )}
            </>
          );
          return (
            <li key={o.manager.userId} className="border-b border-rule">
              {hasGames ? (
                <Link
                  href={`/h2h/${selected.manager.username}/${o.manager.username}`}
                  className="flex min-h-11 items-center gap-3 py-2 hover:bg-row-hover transition-colors"
                >
                  {body}
                </Link>
              ) : (
                <span className="flex min-h-11 items-center gap-3 py-2 opacity-60">
                  {body}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-foreground-subtle">
        Tap any opponent for the per-week receipts. The full 12x12 matrix is on
        desktop.
      </p>
    </div>
  );
}
