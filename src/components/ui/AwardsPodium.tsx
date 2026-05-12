import Link from "next/link";

import { cn } from "@/lib/cn";
import type { Manager } from "@/lib/types";

import { Kicker } from "./Kicker";
import { ManagerAvatar } from "./ManagerAvatar";

export interface PodiumStep {
  place: 1 | 2 | 3;
  manager: Manager | null;
  detail?: React.ReactNode;
}

interface AwardsPodiumProps {
  /** First, second, third — required in that order. */
  steps: PodiumStep[];
  className?: string;
}

const HEIGHTS: Record<PodiumStep["place"], string> = {
  1: "h-20 sm:h-28",
  2: "h-14 sm:h-20",
  3: "h-10 sm:h-16",
};

const ACCENT: Record<PodiumStep["place"], string> = {
  1: "bg-gradient-to-t from-accent/20 to-accent/[0.04] ring-1 ring-inset ring-accent/40",
  2: "bg-gradient-to-t from-accent-secondary/20 to-accent-secondary/[0.04] ring-1 ring-inset ring-accent-secondary/30",
  3: "bg-foreground/[0.04] ring-1 ring-inset ring-border",
};

const LABEL: Record<PodiumStep["place"], string> = {
  1: "1st",
  2: "2nd",
  3: "3rd",
};

const RING: Record<PodiumStep["place"], "gradient" | "accent" | "subtle"> = {
  1: "gradient",
  2: "subtle",
  3: "subtle",
};

const AVATAR_SIZE: Record<PodiumStep["place"], number> = {
  1: 72,
  2: 56,
  3: 48,
};

/**
 * Display the 1/2/3 podium with the gold step in the centre. Steps must be
 * passed in order [1, 2, 3]; the component re-orders them visually as 2-1-3.
 */
export function AwardsPodium({ steps, className }: AwardsPodiumProps) {
  const map = new Map(steps.map((s) => [s.place, s] as const));
  const visualOrder: PodiumStep["place"][] = [2, 1, 3];

  return (
    <div className={cn("flex items-end justify-center gap-3 sm:gap-5", className)}>
      {visualOrder.map((place) => {
        const step = map.get(place);
        if (!step) return null;
        return <PodiumStepNode key={place} step={step} />;
      })}
    </div>
  );
}

function PodiumStepNode({ step }: { step: PodiumStep }) {
  const { place, manager, detail } = step;
  return (
    <div className="flex flex-col items-center gap-2 min-w-0 flex-1 max-w-[180px]">
      {manager ? (
        <Link
          href={`/managers/${manager.username}`}
          className="flex flex-col items-center gap-1.5 group"
        >
          <ManagerAvatar
            manager={manager}
            size={AVATAR_SIZE[place]}
            ring={RING[place]}
          />
          <span className="font-display text-base sm:text-lg text-foreground leading-tight text-center truncate max-w-full">
            {manager.displayName}
          </span>
          <span className="text-[11px] text-foreground-subtle truncate max-w-full">
            @{manager.username}
          </span>
        </Link>
      ) : (
        <div
          className="flex flex-col items-center gap-1.5"
          aria-label="Empty podium step"
        >
          <span
            className="rounded-full bg-foreground/[0.04] border border-border"
            style={{ width: AVATAR_SIZE[place], height: AVATAR_SIZE[place] }}
          />
          <span className="text-[11px] text-foreground-subtle">—</span>
        </div>
      )}
      <div
        className={cn(
          "w-full rounded-t-md flex items-start justify-center",
          HEIGHTS[place],
          ACCENT[place],
        )}
      >
        <span className="mt-2">
          <Kicker tone={place === 1 ? "accent" : "muted"}>{LABEL[place]}</Kicker>
        </span>
      </div>
      {detail !== undefined ? (
        <span className="text-[11px] text-foreground-muted tabular text-center truncate max-w-full">
          {detail}
        </span>
      ) : null}
    </div>
  );
}
