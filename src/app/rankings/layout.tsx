import Link from "next/link";

const TABS: Array<{ href: string; label: string; hint: string }> = [
  { href: "/rankings/dynasty", label: "Dynasty", hint: "long-term roster" },
  { href: "/rankings/season", label: "Season", hint: "this year" },
  { href: "/rankings/quadrant", label: "Quadrant", hint: "now vs. future" },
  { href: "/rankings/trend", label: "Trend", hint: "30d gainers" },
];

export default function RankingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="relative">
      <div className="sticky top-14 z-20 border-b border-border bg-surface/80 backdrop-blur-md">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 flex items-center gap-1 overflow-x-auto h-12">
          {TABS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="rounded-md px-3 py-1.5 text-sm text-foreground-muted hover:text-foreground hover:bg-foreground/5 transition-colors flex items-baseline gap-2 whitespace-nowrap"
            >
              <span className="font-medium">{t.label}</span>
              <span className="text-[10px] uppercase tracking-[0.18em] text-foreground-subtle">
                {t.hint}
              </span>
            </Link>
          ))}
        </div>
      </div>
      {children}
    </main>
  );
}
