"use client";

import { useEffect, useRef } from "react";

/**
 * Horizontal scroll container for the week pills that starts scrolled to the
 * active week. Landing on /matchups/2025/14 at 390px used to show pills 1-7
 * with the active week off-screen to the right. Centers the pill marked
 * [aria-current="page"] by setting scrollLeft directly — scrollIntoView can
 * scroll ancestors, and this must never move the page itself.
 */
export function WeekPillsScroller({
  children,
}: {
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scroller = ref.current;
    if (!scroller) return;
    const active = scroller.querySelector('[aria-current="page"]');
    if (!(active instanceof HTMLElement)) return;
    const pill = active.getBoundingClientRect();
    const box = scroller.getBoundingClientRect();
    const target =
      pill.left - box.left + scroller.scrollLeft - (box.width - pill.width) / 2;
    scroller.scrollLeft = Math.max(0, target);
  }, []);

  return (
    <div
      ref={ref}
      className="flex items-center gap-1 rounded-lg border border-border bg-surface p-1 overflow-x-auto max-w-full"
    >
      {children}
    </div>
  );
}
