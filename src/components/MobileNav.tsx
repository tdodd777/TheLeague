"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { isActiveNav } from "./nav-active";

const NAV_LINKS: ReadonlyArray<{ href: string; label: string }> = [
  { href: "/", label: "Home" },
  { href: "/standings", label: "Standings" },
  { href: "/managers", label: "Managers" },
  { href: "/rankings/dynasty", label: "Rankings" },
  { href: "/matchups", label: "Matchups" },
  { href: "/h2h", label: "H2H" },
  { href: "/records", label: "Records" },
  { href: "/history", label: "History" },
  { href: "/awards", label: "Awards" },
  { href: "/transactions", label: "Transactions" },
  { href: "/drafts", label: "Drafts" },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPointer = (e: Event) => {
      const target = e.target as Node;
      if (
        panelRef.current &&
        !panelRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  return (
    <div className="sm:hidden">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close navigation menu" : "Open navigation menu"}
        aria-expanded={open}
        aria-controls="mobile-nav-panel"
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-foreground-muted hover:text-foreground hover:border-border-strong transition-colors"
      >
        {open ? <X size={16} strokeWidth={1.75} /> : <Menu size={16} strokeWidth={1.75} />}
      </button>

      {open ? (
        <div
          id="mobile-nav-panel"
          ref={panelRef}
          role="dialog"
          aria-label="Navigation"
          className="absolute left-0 right-0 top-full mt-px border-b border-border bg-background/95 backdrop-blur-md shadow-lg"
        >
          <ul className="mx-auto max-w-6xl px-4 py-3 flex flex-col">
            {NAV_LINKS.map((n) => {
              const active = isActiveNav(n.href, pathname);
              return (
                <li key={n.href}>
                  <Link
                    href={n.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={
                      active
                        ? "block rounded-md px-3 py-2.5 text-sm font-medium text-foreground bg-foreground/[0.06]"
                        : "block rounded-md px-3 py-2.5 text-sm text-foreground-muted hover:text-foreground hover:bg-foreground/5 transition-colors"
                    }
                  >
                    {n.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
