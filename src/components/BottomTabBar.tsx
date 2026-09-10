"use client";

import { House, Swords, TrendingUp, Trophy } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { isActiveNav } from "./nav-active";

/**
 * Phone-only bottom tab bar: one-tap access to the four core destinations.
 * Everything else stays in the hamburger menu, which also keeps these four —
 * a duplicate row in a list is cheaper than a "where did Standings go" moment.
 *
 * Hidden from `lg` where the full desktop nav takes over. Sits at z-20: above
 * page content and its sticky table columns (z-10), below the header (z-30) so
 * an open mobile menu panel covers it, and below the live banner and install
 * sheet (z-40), which both clear its height on phones.
 */
const TABS: ReadonlyArray<{
  href: string;
  label: string;
  Icon: typeof House;
}> = [
  { href: "/", label: "Home", Icon: House },
  { href: "/matchups", label: "Matchups", Icon: Swords },
  { href: "/standings", label: "Standings", Icon: Trophy },
  { href: "/rankings/dynasty", label: "Rankings", Icon: TrendingUp },
];

export function BottomTabBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Quick navigation"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="mx-auto grid h-14 max-w-md grid-cols-4">
        {TABS.map(({ href, label, Icon }) => {
          const active = isActiveNav(href, pathname);
          return (
            <li key={href} className="flex">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={
                  active
                    ? "flex min-h-11 w-full flex-col items-center justify-center gap-1 text-accent focus-hairline"
                    : "flex min-h-11 w-full flex-col items-center justify-center gap-1 text-foreground-muted hover:text-foreground transition-colors focus-hairline"
                }
              >
                <Icon size={20} strokeWidth={1.75} aria-hidden />
                <span className="text-[10px] leading-none tracking-wide">
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
