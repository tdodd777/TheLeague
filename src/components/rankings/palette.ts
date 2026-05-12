/**
 * Position color palette used across rankings visualizations (stacked bar,
 * dots in lineups, scatter plot bubbles). Kept distinct from accent colors
 * so it reads as data semantics, not decoration.
 */
export const POSITION_COLOR: Record<string, string> = {
  QB: "#f43f5e", // rose
  RB: "#10b981", // emerald
  WR: "#0ea5e9", // sky
  TE: "#f59e0b", // amber
  K: "#a855f7", // violet
  DEF: "#64748b", // slate
  PICK: "#f5b54a", // accent primary
  UNK: "#27272a",
};

export function positionColor(position: string): string {
  return POSITION_COLOR[position] ?? POSITION_COLOR["UNK"]!;
}

/**
 * Map a 30-day trend value (positive = rising) to a fill color used for
 * quadrant bubbles and trend pills. Centered at 0; saturation grows with
 * |trend|.
 */
export function trendColor(trend: number): string {
  if (!Number.isFinite(trend) || trend === 0) return "#71717a"; // zinc-500
  if (trend > 0) {
    // greens
    if (trend > 600) return "#15803d";
    if (trend > 200) return "#22c55e";
    return "#4ade80";
  }
  if (trend < -600) return "#b91c1c";
  if (trend < -200) return "#ef4444";
  return "#fca5a5";
}

export function compactNumber(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 100_000) return (n / 1000).toFixed(0) + "k";
  if (abs >= 10_000) return (n / 1000).toFixed(1) + "k";
  if (abs >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return n.toFixed(0);
}

export function formatPickLabel(season: number, round: number, slot: number | null | undefined): string {
  if (typeof slot === "number" && slot > 0) {
    return `${season} ${round}.${String(slot).padStart(2, "0")}`;
  }
  return `${season} R${round}`;
}
