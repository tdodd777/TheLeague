import { cn } from "@/lib/cn";

export interface ScatterPoint {
  id: string;
  x: number;
  y: number;
  /** Bubble radius in px (rendered directly). */
  r?: number;
  /** Bubble fill color (any valid CSS color). */
  color?: string;
  label?: string;
  /** Text rendered next to / under the bubble. */
  caption?: string;
}

interface ScatterPlotProps {
  points: ScatterPoint[];
  width?: number;
  height?: number;
  /** Manual axis domains. Falls back to data extents (with 5% padding). */
  xDomain?: [number, number];
  yDomain?: [number, number];
  xLabel?: string;
  yLabel?: string;
  /** Draw median split lines at the data median (or override). */
  medianX?: number;
  medianY?: number;
  className?: string;
  /** Optional quadrant labels in TR/TL/BR/BL order. */
  quadrantLabels?: { tr?: string; tl?: string; br?: string; bl?: string };
}

const PAD = { top: 24, right: 24, bottom: 36, left: 44 };
const LABEL_FONT_PX = 10;
const LABEL_PAD_Y = 4;

interface PlacedPoint extends ScatterPoint {
  cx: number;
  cy: number;
  rr: number;
  labelX?: number;
  labelY?: number;
  labelHidden?: boolean;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function boxesOverlap(a: Box, b: Box): boolean {
  return !(
    a.x + a.w < b.x ||
    b.x + b.w < a.x ||
    a.y + a.h < b.y ||
    b.y + b.h < a.y
  );
}

export function ScatterPlot({
  points,
  width = 640,
  height = 420,
  xDomain,
  yDomain,
  xLabel,
  yLabel,
  medianX,
  medianY,
  quadrantLabels,
  className,
}: ScatterPlotProps) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const dataXMin = xs.length ? Math.min(...xs) : 0;
  const dataXMax = xs.length ? Math.max(...xs) : 1;
  const dataYMin = ys.length ? Math.min(...ys) : 0;
  const dataYMax = ys.length ? Math.max(...ys) : 1;
  const xPad = (dataXMax - dataXMin) * 0.08 || 1;
  const yPad = (dataYMax - dataYMin) * 0.08 || 1;
  const [xMin, xMax] = xDomain ?? [dataXMin - xPad, dataXMax + xPad];
  const [yMin, yMax] = yDomain ?? [dataYMin - yPad, dataYMax + yPad];

  const innerW = width - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;

  function sx(x: number): number {
    if (xMax === xMin) return PAD.left + innerW / 2;
    return PAD.left + ((x - xMin) / (xMax - xMin)) * innerW;
  }
  function sy(y: number): number {
    if (yMax === yMin) return PAD.top + innerH / 2;
    return PAD.top + innerH - ((y - yMin) / (yMax - yMin)) * innerH;
  }

  const mxX = medianX !== undefined ? sx(medianX) : null;
  const myY = medianY !== undefined ? sy(medianY) : null;

  // Greedy label placement: try below first, then above. Skip on conflict.
  // Sort by y so top-most points place first (more visual weight on top).
  const initial: PlacedPoint[] = points.map((p) => ({
    ...p,
    cx: sx(p.x),
    cy: sy(p.y),
    rr: p.r ?? 6,
  }));
  const placed: PlacedPoint[] = [...initial].sort((a, b) => a.cy - b.cy);
  const occupied: Box[] = [];

  for (const pt of placed) {
    if (!pt.label) continue;
    const w = pt.label.length * (LABEL_FONT_PX * 0.58);
    const candidates: Array<{ x: number; y: number }> = [
      { x: pt.cx, y: pt.cy + pt.rr + 12 }, // below baseline
      { x: pt.cx, y: pt.cy - pt.rr - LABEL_PAD_Y - 2 }, // above baseline
    ];

    let chosen: { x: number; y: number } | null = null;
    for (const c of candidates) {
      const box: Box = {
        x: c.x - w / 2 - 2,
        y: c.y - LABEL_FONT_PX,
        w: w + 4,
        h: LABEL_FONT_PX + LABEL_PAD_Y,
      };
      if (
        box.x < PAD.left - 4 ||
        box.x + box.w > PAD.left + innerW + 4 ||
        box.y < PAD.top - 4 ||
        box.y + box.h > PAD.top + innerH + 16
      ) {
        continue;
      }
      const collides = occupied.some((o) => boxesOverlap(o, box));
      if (!collides) {
        chosen = c;
        occupied.push(box);
        break;
      }
    }

    if (chosen) {
      pt.labelX = chosen.x;
      pt.labelY = chosen.y;
    } else {
      pt.labelHidden = true;
    }
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("block w-full h-auto scatter-plot", className)}
      role="img"
    >
      <style>{`
        .scatter-plot .sp-label-hidden { opacity: 0; transition: opacity 120ms ease; }
        .scatter-plot .sp-bubble:hover ~ .sp-label-hidden,
        .scatter-plot .sp-bubble:focus ~ .sp-label-hidden { opacity: 1; }
        .scatter-plot .sp-group:hover .sp-label-hidden,
        .scatter-plot .sp-group:focus-within .sp-label-hidden { opacity: 1; }
        .scatter-plot .sp-bubble { cursor: default; }
      `}</style>

      {/* axis frame */}
      <rect
        x={PAD.left}
        y={PAD.top}
        width={innerW}
        height={innerH}
        fill="none"
        stroke="var(--border)"
      />

      {/* median splits */}
      {mxX !== null ? (
        <line
          x1={mxX}
          x2={mxX}
          y1={PAD.top}
          y2={PAD.top + innerH}
          stroke="var(--border-strong)"
          strokeDasharray="3 3"
        />
      ) : null}
      {myY !== null ? (
        <line
          x1={PAD.left}
          x2={PAD.left + innerW}
          y1={myY}
          y2={myY}
          stroke="var(--border-strong)"
          strokeDasharray="3 3"
        />
      ) : null}

      {/* quadrant labels */}
      {quadrantLabels && mxX !== null && myY !== null ? (
        <g
          fontSize={10}
          fontFamily="var(--font-display), serif"
          fontStyle="italic"
          fill="var(--foreground-subtle)"
          letterSpacing="0.18em"
          style={{ textTransform: "uppercase" }}
        >
          {quadrantLabels.tl ? (
            <text x={PAD.left + 6} y={PAD.top + 12}>
              {quadrantLabels.tl}
            </text>
          ) : null}
          {quadrantLabels.tr ? (
            <text
              x={PAD.left + innerW - 6}
              y={PAD.top + 12}
              textAnchor="end"
            >
              {quadrantLabels.tr}
            </text>
          ) : null}
          {quadrantLabels.bl ? (
            <text x={PAD.left + 6} y={PAD.top + innerH - 4}>
              {quadrantLabels.bl}
            </text>
          ) : null}
          {quadrantLabels.br ? (
            <text
              x={PAD.left + innerW - 6}
              y={PAD.top + innerH - 4}
              textAnchor="end"
            >
              {quadrantLabels.br}
            </text>
          ) : null}
        </g>
      ) : null}

      {/* axis labels */}
      {xLabel ? (
        <text
          x={PAD.left + innerW / 2}
          y={height - 8}
          textAnchor="middle"
          fontSize={11}
          fill="var(--foreground-muted)"
        >
          {xLabel}
        </text>
      ) : null}
      {yLabel ? (
        <text
          x={-PAD.top - innerH / 2}
          y={14}
          textAnchor="middle"
          fontSize={11}
          fill="var(--foreground-muted)"
          transform="rotate(-90)"
        >
          {yLabel}
        </text>
      ) : null}

      {/* points */}
      {placed.map((p) => (
        <g key={p.id} className="sp-group">
          <circle
            className="sp-bubble"
            cx={p.cx}
            cy={p.cy}
            r={p.rr}
            fill={p.color ?? "var(--accent-primary)"}
            fillOpacity={0.85}
            stroke="var(--background)"
            strokeWidth={1.5}
            tabIndex={0}
          >
            {p.label ? <title>{p.label}</title> : null}
          </circle>
          {p.caption ? (
            <text
              x={p.cx}
              y={p.cy - p.rr - 4}
              textAnchor="middle"
              fontSize={10}
              fill="var(--foreground)"
              className="tabular"
            >
              {p.caption}
            </text>
          ) : null}
          {p.label && !p.labelHidden && p.labelX !== undefined && p.labelY !== undefined ? (
            <text
              x={p.labelX}
              y={p.labelY}
              textAnchor="middle"
              fontSize={LABEL_FONT_PX}
              fill="var(--foreground-muted)"
              pointerEvents="none"
            >
              {p.label}
            </text>
          ) : null}
          {p.label && p.labelHidden ? (
            <text
              className="sp-label-hidden"
              x={p.cx}
              y={p.cy + p.rr + 12}
              textAnchor="middle"
              fontSize={LABEL_FONT_PX}
              fill="var(--foreground)"
              pointerEvents="none"
            >
              {p.label}
            </text>
          ) : null}
        </g>
      ))}
    </svg>
  );
}
