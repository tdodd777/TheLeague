"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/cn";

import { Sparkline } from "./Sparkline";

type StatTileAccent = "primary" | "secondary" | null;

interface StatTileProps {
  label: string;
  value: number | string;
  subValue?: React.ReactNode;
  accent?: StatTileAccent;
  /**
   * Animate count-up when value is numeric and tile enters viewport.
   * Default: false (per ARCHITECTURE.md §7 motion budget). Opt-in for hero metrics only.
   */
  animate?: boolean;
  precision?: 0 | 1 | 2;
  prefix?: string;
  suffix?: string;
  sparkline?: number[];
  className?: string;
}

const ACCENT_BORDER: Record<NonNullable<StatTileAccent>, string> = {
  primary: "before:bg-accent",
  secondary: "before:bg-accent-secondary",
};

export function StatTile({
  label,
  value,
  subValue,
  accent = null,
  animate: animated = false,
  precision = 0,
  prefix,
  suffix,
  sparkline,
  className,
}: StatTileProps) {
  const isNumeric = typeof value === "number";

  return (
    <div
      className={cn(
        "relative flex flex-col gap-1.5 rounded-lg border border-border bg-surface px-4 py-3.5 overflow-hidden",
        accent
          ? cn(
              "before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[2px]",
              ACCENT_BORDER[accent],
            )
          : "",
        className,
      )}
    >
      <span className="text-[10px] uppercase tracking-[0.18em] text-foreground-subtle font-medium">
        {label}
      </span>
      <div className="flex items-baseline gap-2 min-w-0">
        {isNumeric && animated ? (
          <CountUp
            value={value}
            precision={precision}
            prefix={prefix}
            suffix={suffix}
          />
        ) : (
          <span className="text-2xl sm:text-3xl font-medium tabular leading-none text-foreground">
            {prefix}
            {isNumeric
              ? value.toLocaleString("en-US", {
                  minimumFractionDigits: precision,
                  maximumFractionDigits: precision,
                })
              : value}
            {suffix}
          </span>
        )}
      </div>
      {subValue !== undefined ? (
        <span className="text-xs text-foreground-muted tabular leading-tight">
          {subValue}
        </span>
      ) : null}
      {sparkline && sparkline.length >= 2 ? (
        <div className="mt-1.5 -mx-1">
          <Sparkline
            values={sparkline}
            width={140}
            height={28}
            stroke="var(--accent-primary)"
            fillGradient
            className="text-accent w-full"
          />
        </div>
      ) : null}
    </div>
  );
}

function format(
  value: number,
  precision: 0 | 1 | 2,
  prefix: string | undefined,
  suffix: string | undefined,
): string {
  return `${prefix ?? ""}${value.toLocaleString("en-US", {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  })}${suffix ?? ""}`;
}

function CountUp({
  value,
  precision,
  prefix,
  suffix,
}: {
  value: number;
  precision: 0 | 1 | 2;
  prefix: string | undefined;
  suffix: string | undefined;
}) {
  const spanRef = useRef<HTMLSpanElement>(null);
  const [resolved, setResolved] = useState<number>(() => {
    // Render the final value during SSR / initial paint so users with
    // reduced motion (and bots) see the real number; the count-up swaps in
    // only after we confirm motion is allowed and the tile is in view.
    return value;
  });
  const [shouldAnimate, setShouldAnimate] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) return;
    setShouldAnimate(true);
    setResolved(0);
  }, []);

  useEffect(() => {
    if (!shouldAnimate) return;
    const node = spanRef.current;
    if (!node) return;

    let raf = 0;
    let started = false;
    let startTs = 0;
    const duration = 700;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry || !entry.isIntersecting || started) return;
        started = true;
        observer.disconnect();

        const tick = (ts: number) => {
          if (startTs === 0) startTs = ts;
          const elapsed = ts - startTs;
          const t = Math.min(1, elapsed / duration);
          // Cubic ease-out: 1 - (1 - t)^3 — matches the prior motion curve.
          const eased = 1 - Math.pow(1 - t, 3);
          const current = value * eased;
          node.textContent = format(current, precision, prefix, suffix);
          if (t < 1) {
            raf = requestAnimationFrame(tick);
          } else {
            node.textContent = format(value, precision, prefix, suffix);
          }
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.5 },
    );
    observer.observe(node);

    return () => {
      observer.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [shouldAnimate, value, precision, prefix, suffix]);

  return (
    <span
      ref={spanRef}
      className="text-2xl sm:text-3xl font-medium tabular leading-none text-foreground"
    >
      {format(resolved, precision, prefix, suffix)}
    </span>
  );
}
