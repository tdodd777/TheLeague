"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS: Array<{ href: string; label: string; hint: string }> = [
  { href: "/rankings/dynasty", label: "Dynasty", hint: "long-term roster" },
  { href: "/rankings/season", label: "Season", hint: "this year" },
  { href: "/rankings/quadrant", label: "Quadrant", hint: "now vs. future" },
  { href: "/rankings/trend", label: "Trend", hint: "30d gainers" },
];

/**
 * Phone: a non-sticky, single-row selector. The bar used to be `sticky top-14`
 * beneath the sticky header, which cost 104px of an 844px viewport before any
 * content, and the label+hint pairs overflowed into a horizontal scroller that
 * hid the last two views. Hints are desktop-only; all four fit without panning.
 */
export function RankingTabs() {
  const pathname = usePathname();
  return (
    <div className="border-b border-border bg-surface/80 lg:sticky lg:top-14 lg:z-20 lg:backdrop-blur-md">
      <nav
        aria-label="Ranking views"
        className="mx-auto max-w-6xl px-4 sm:px-6 flex items-stretch gap-1 lg:h-12"
      >
        {TABS.map((t) => {
          const active = pathname === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={[
                "flex flex-1 lg:flex-none min-h-11 items-center justify-center lg:justify-start",
                "rounded-md px-2 lg:px-3 text-sm transition-colors lg:gap-2 lg:items-baseline",
                "whitespace-nowrap",
                active
                  ? "text-foreground font-medium bg-foreground/[0.06]"
                  : "text-foreground-muted hover:text-foreground hover:bg-foreground/5",
              ].join(" ")}
            >
              <span className="font-medium">{t.label}</span>
              <span className="hidden lg:inline text-[10px] uppercase tracking-[0.18em] text-foreground-subtle">
                {t.hint}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
