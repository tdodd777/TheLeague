import { Info } from "lucide-react";

import { cn } from "@/lib/cn";
import { Kicker } from "@/components/ui";

interface RankingsCaveatsProps {
  className?: string;
}

const ITEMS: Array<{ title: string; body: string }> = [
  {
    title: "Crowd-sourced, not predictive.",
    body: "Values are trade-market consensus, not weekly projections. A drop doesn't mean a player will play badly next week.",
  },
  {
    title: "TEP is approximated.",
    body: "FantasyCalc's API doesn't accept a TEP parameter. We apply a multiplier post-fetch — close, but not exact. (No-op for this league since bonus_rec_te = 0.)",
  },
  {
    title: "Future picks default to mid-round.",
    body: "Year+1 and beyond use slot 7 (mid-round, 12-team) until trajectory-aware tiering ships.",
  },
  {
    title: "IDPs aren't valued.",
    body: "FantasyCalc doesn't cover individual defensive players. If an IDP league forks this site, those rosters are systematically under-counted.",
  },
  {
    title: "Stud weighting is opinionated.",
    body: "Tier multipliers (1.0/0.5/0.2/0.4) and the 6000 stud-bonus threshold are heuristics. Reasonable people would pick different numbers.",
  },
  {
    title: "30-day trends are noisy off-season.",
    body: "Low trade volume amplifies small movements. Trend display is suppressed April through July.",
  },
];

export function RankingsCaveats({ className }: RankingsCaveatsProps) {
  return (
    <details
      open
      className={cn(
        "group rounded-xl border border-border bg-surface px-4 py-3 text-sm",
        className,
      )}
    >
      <summary className="cursor-pointer list-none flex items-center gap-2 text-foreground-muted hover:text-foreground transition-colors">
        <Info size={14} strokeWidth={1.75} />
        <Kicker tone="muted">Caveats — read before arguing in the chat</Kicker>
        <span className="ml-auto text-[11px] text-foreground-subtle group-open:hidden">
          show
        </span>
        <span className="ml-auto text-[11px] text-foreground-subtle hidden group-open:inline">
          hide
        </span>
      </summary>
      <ol className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-[13px] leading-relaxed">
        {ITEMS.map((it) => (
          <li key={it.title} className="flex flex-col gap-0.5">
            <span className="text-foreground font-medium">{it.title}</span>
            <span className="text-foreground-muted">{it.body}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}
