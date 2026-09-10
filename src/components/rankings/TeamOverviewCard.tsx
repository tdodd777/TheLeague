import { cn } from "@/lib/cn";
import { Card, PlayerImage, RankRing } from "@/components/ui";
import { rankTone } from "./palette";
import type { GroupStrength, TeamStrength } from "@/lib/rankings";
import { ordinal, ordinalSuffix } from "@/lib/rankings";

/**
 * What the lineup strip needs from a starter. `ValuedAsset` (dynasty and
 * season views) and the week view's projected-points asset both satisfy it.
 */
export interface OverviewStripAsset {
  assetId: string;
  name: string;
  position: string;
  team: string | null;
  /** The value this view ranks on: FantasyCalc dollars or projected points. */
  value: number;
  positionRank: number | null;
}

interface TeamOverviewCardProps {
  /** The starting lineup this view was computed from. */
  starters: ReadonlyArray<{ asset: OverviewStripAsset }>;
  strength: TeamStrength;
  /** What the ring's rank is measured in: "Dynasty value", "Week 3 projected". */
  valueLabel: string;
  /** Plain-language note on what the rows rank and where the numbers come from. */
  footnote: React.ReactNode;
  className?: string;
}

/** How many headshots the lineup strip carries before it scrolls. */
const STRIP_SIZE = 8;

/**
 * The at-a-glance read on a roster: where it lands league-wide, and which
 * position groups got it there. Everything is relative to the other eleven
 * teams, so a bar that runs short means the league is deeper there, not that
 * the player is bad.
 */
export function TeamOverviewCard({
  starters,
  strength,
  valueLabel,
  footnote,
  className,
}: TeamOverviewCardProps) {
  // The strip leads with the lineup, best first, so the first face is the
  // roster's best player rather than whoever the slot order happens to put at
  // the top.
  const strip = [...starters]
    .sort((a, b) => b.asset.value - a.asset.value)
    .slice(0, STRIP_SIZE);

  return (
    <Card variant="default" padding="md" className={cn("flex flex-col gap-5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[10px] uppercase tracking-[0.18em] text-foreground-subtle">
          {valueLabel}
        </span>
        <span className="text-[10px] uppercase tracking-[0.18em] text-foreground-subtle tabular">
          Score {strength.score} of 100
        </span>
      </div>

      <div className="flex flex-col sm:flex-row items-center sm:items-stretch gap-6 sm:gap-8">
        <div className="flex flex-col items-center gap-2 shrink-0">
          <RankRing
            rank={strength.overallRank}
            total={strength.teamCount}
            suffix={ordinalSuffix(strength.overallRank)}
            caption={`of ${strength.teamCount}`}
            tone={rankTone(strength.overallRank, strength.teamCount)}
          />
        </div>

        <ul className="flex flex-1 flex-col justify-center gap-2 w-full min-w-0">
          {strength.groups.map((group) => (
            <StrengthRow
              key={group.key}
              group={group}
              teamCount={strength.teamCount}
            />
          ))}
        </ul>
      </div>

      {strip.length > 0 ? (
        <div className="flex flex-col gap-2 border-t border-rule pt-4">
          <span className="text-[10px] uppercase tracking-[0.16em] text-foreground-subtle">
            Best of the lineup
          </span>
          <ul className="flex gap-4 overflow-x-auto pb-1 -mx-1 px-1">
            {strip.map(({ asset }) => (
              <li
                key={asset.assetId}
                className="flex w-[72px] shrink-0 flex-col items-center gap-1.5 text-center"
              >
                <span className="relative">
                  <PlayerImage
                    playerId={asset.assetId}
                    position={asset.position}
                    name={asset.name}
                    size={56}
                  />
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded px-1 py-px text-[9px] font-medium uppercase tracking-wide tabular text-foreground bg-surface ring-1 ring-inset ring-border-strong whitespace-nowrap">
                    {asset.positionRank !== null
                      ? `${asset.position}${asset.positionRank}`
                      : asset.position}
                  </span>
                </span>
                <span className="mt-1 text-[11px] leading-tight text-foreground truncate w-full">
                  {shortName(asset.name)}
                </span>
                <span className="text-[10px] text-foreground-subtle tabular">
                  {asset.team ?? "FA"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-[11px] leading-relaxed text-foreground-muted">
        {footnote}
      </p>
    </Card>
  );
}

function StrengthRow({
  group,
  teamCount,
}: {
  group: GroupStrength;
  teamCount: number;
}) {
  const tone = rankTone(group.rank, teamCount);
  return (
    <li
      className="flex items-center gap-3"
      title={`${group.description}: ${ordinal(group.rank)} of ${teamCount}`}
    >
      <span className="w-11 shrink-0 text-[11px] font-medium uppercase tracking-[0.1em] text-foreground-muted">
        {group.label}
      </span>
      <span
        className="h-2 flex-1 min-w-0 overflow-hidden rounded-full bg-foreground/[0.06]"
        role="img"
        aria-label={`${group.description}: ranked ${group.rank} of ${teamCount}`}
      >
        <span
          className="block h-full rounded-full"
          style={{
            width: `${Math.max(5, group.share * 100)}%`,
            background: tone,
          }}
        />
      </span>
      <span className="w-10 shrink-0 text-right text-xs tabular text-foreground">
        {group.rank}
        <span className="text-foreground-subtle">
          {ordinalSuffix(group.rank)}
        </span>
      </span>
    </li>
  );
}

/** "Josh Allen" → "J. Allen", so eight names fit the strip without wrapping. */
function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  const first = parts[0] ?? "";
  const last = parts.slice(1).join(" ");
  return `${first.charAt(0)}. ${last}`;
}
