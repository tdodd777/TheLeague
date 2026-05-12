"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { isActiveNav } from "./nav-active";

interface NavLinksProps {
  links: ReadonlyArray<{ href: string; label: string }>;
}

export function NavLinks({ links }: NavLinksProps) {
  const pathname = usePathname();
  return (
    <ul className="hidden sm:flex items-center gap-0.5 ml-2">
      {links.map((n) => {
        const active = isActiveNav(n.href, pathname);
        return (
          <li key={n.href}>
            <Link
              href={n.href}
              aria-current={active ? "page" : undefined}
              className={
                active
                  ? "rounded-md px-3 py-1.5 text-sm font-medium text-foreground bg-foreground/[0.06]"
                  : "rounded-md px-3 py-1.5 text-sm text-foreground-muted hover:text-foreground hover:bg-foreground/5 transition-colors"
              }
            >
              {n.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
