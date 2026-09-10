"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { Manager } from "@/lib/types";

import { draftClock, pickLabel } from "./draft-clock";
import { useLiveDraft } from "./useLiveDraft";

interface Props {
  draftId: string;
  season: string;
  managers: Manager[];
}

/**
 * Floating "the draft is live" pill, mounted site-wide from the root layout.
 * A statically built site has no other way to tell someone browsing the
 * records book that picks are coming in right now.
 *
 * Renders only while Sleeper reports the draft as drafting or paused, and
 * never on the draft's own year page, where the room itself is already on
 * screen (older year pages keep the banner — they show no live component).
 * It shares LiveBanner's fixed slot: rookie drafts run in the offseason,
 * when the game-day banner's season gate keeps it off the page.
 */
export function DraftLiveBanner({ draftId, season, managers }: Props) {
  const path = usePathname();
  // Gate the hook rather than only the render: starting the poll and then
  // returning null would run a second copy of the draft room's fetch loop.
  const suppressed = path === `/drafts/${season}`;
  const { draft, picks, tradedPicks } = useLiveDraft({
    draftId,
    enabled: !suppressed,
  });

  if (suppressed) return null;
  if (!draft || (draft.status !== "drafting" && draft.status !== "paused")) {
    return null;
  }

  const clock = draftClock(draft, picks ?? [], tradedPicks ?? [], managers);

  return (
    <Link
      href={`/drafts/${season}`}
      // Below lg the bottom tab bar owns the bottom edge (3.5rem + safe-area
      // inset), so float the same 1rem gap above it instead of behind it.
      className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] lg:bottom-4 left-1/2 -translate-x-1/2 z-40 inline-flex min-h-11 items-center gap-3 rounded-full border border-border bg-surface-elevated/95 backdrop-blur-md px-4 py-2 text-xs shadow-lg hover:border-border-strong transition-colors"
    >
      <span className="relative flex h-2 w-2">
        {draft.status === "drafting" ? (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-positive opacity-75" />
        ) : null}
        <span
          className={`relative inline-flex h-2 w-2 rounded-full ${
            draft.status === "drafting" ? "bg-positive" : "bg-warning"
          }`}
        />
      </span>
      <span className="text-foreground-muted">
        {draft.status === "paused" ? "Draft paused" : "Draft live"}
      </span>
      <span className="tabular text-foreground">
        {clock
          ? `${pickLabel(clock.round, clock.slot)} · ${
              clock.manager ? `@${clock.manager.username}` : "on the clock"
            }`
          : "final picks in"}
      </span>
    </Link>
  );
}
