import Link from "next/link";

import { LEAGUE_NAME } from "@/config/site";

export const metadata = {
  title: `Off the playbook · ${LEAGUE_NAME}`,
};

const PAGES: ReadonlyArray<{ href: string; label: string; hint: string }> = [
  { href: "/", label: "Home", hint: "live scores and the league pulse" },
  { href: "/standings", label: "Standings", hint: "playoff race and PF" },
  { href: "/managers", label: "Managers", hint: "owners and rosters" },
  { href: "/rankings/dynasty", label: "Dynasty Rankings", hint: "long-term roster value" },
  { href: "/h2h", label: "Head to Head", hint: "every pair, every meeting" },
  { href: "/records", label: "Records", hint: "the bar to clear" },
];

export default function NotFound() {
  return (
    <main className="relative">
      <section className="relative overflow-hidden border-b border-border">
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 pt-14 pb-12 sm:pt-20 sm:pb-16 flex flex-col gap-6">
          <span className="kicker">404 · Off the playbook</span>
          <h1 className="font-display text-foreground text-[3rem] sm:text-[5rem] leading-[0.95] tracking-tight max-w-3xl">
            That page isn&rsquo;t in the league.
          </h1>
          <p className="text-foreground-muted text-base sm:text-[17px] leading-relaxed max-w-2xl">
            Either the URL is mistyped, a page got renamed in a recent
            redesign, or you followed a stale link from a group chat circa
            last season. The league is where it&rsquo;s always been &mdash; pick a
            page below.
          </p>
          <div className="editorial-rule mt-2" aria-hidden>
            ❦
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-10 pb-16">
        <span className="kicker">Try one of these</span>
        <ol className="mt-4 border-y border-rule">
          {PAGES.map((p, i) => (
            <li key={p.href}>
              <Link
                href={p.href}
                className="flex items-center gap-4 py-3 px-3 hover:bg-row-hover transition-colors group"
              >
                <span className="font-display text-2xl text-foreground-subtle tabular leading-none w-8 shrink-0">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="font-display text-2xl sm:text-[28px] text-foreground leading-none group-hover:text-accent transition-colors">
                  {p.label}
                </span>
                <span className="text-[11px] text-foreground-subtle tabular ml-auto">
                  {p.hint}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
