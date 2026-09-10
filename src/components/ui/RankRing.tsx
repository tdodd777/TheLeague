import { cn } from "@/lib/cn";

interface RankRingProps {
  /** 1-based rank. */
  rank: number;
  /** How many teams the rank is out of. */
  total: number;
  /** Ordinal suffix ("st", "nd", ...) rendered small next to the number. */
  suffix: string;
  /** Diameter in px. */
  size?: number;
  /** Ring thickness in px. */
  stroke?: number;
  /** Small caption under the ordinal, e.g. "of 12". */
  caption?: string;
  /** Arc color. Callers pass a semantic token; defaults to the league accent. */
  tone?: string;
  className?: string;
}

/**
 * The ordinal ring on the team overview card: a single arc whose sweep is the
 * rank's percentile, with the ordinal set display-italic inside it.
 *
 * The arc color comes from the caller (rankings pass a semantic rank tone) and
 * never carries the meaning alone: the ordinal, the arc length, and the caption
 * all say the same thing without it.
 */
export function RankRing({
  rank,
  total,
  suffix,
  size = 132,
  stroke = 8,
  caption,
  tone = "var(--accent-primary)",
  className,
}: RankRingProps) {
  const safeTotal = Math.max(1, total);
  const clampedRank = Math.min(Math.max(1, rank), safeTotal);
  // 1st fills the ring, last leaves a sliver — the arc reads as "share of the
  // league you are ahead of", not as a raw rank.
  const fraction =
    safeTotal === 1 ? 1 : (safeTotal - clampedRank + 1) / safeTotal;

  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`Ranked ${rank} of ${total}`}
        className="-rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border-strong)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={tone}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circumference * fraction} ${circumference}`}
        />
      </svg>
      <span
        className="absolute inset-0 flex flex-col items-center justify-center"
        aria-hidden
      >
        <span className="font-display text-foreground leading-none tabular flex items-baseline">
          <span style={{ fontSize: size * 0.38 }}>{rank}</span>
          <span style={{ fontSize: size * 0.16 }}>{suffix}</span>
        </span>
        {caption ? (
          <span className="text-[10px] uppercase tracking-[0.16em] text-foreground-subtle mt-1">
            {caption}
          </span>
        ) : null}
      </span>
    </div>
  );
}
