"use client";

import { Menu, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { OPEN_COMMAND_PALETTE_EVENT } from "./command/CommandPaletteRoot";
import { isActiveNav, NAV_LINKS } from "./nav-active";

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
    <div className="lg:hidden">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close navigation menu" : "Open navigation menu"}
        aria-expanded={open}
        aria-controls="mobile-nav-panel"
        className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-border text-foreground-muted hover:text-foreground hover:border-border-strong transition-colors"
      >
        {open ? <X size={18} strokeWidth={1.75} /> : <Menu size={18} strokeWidth={1.75} />}
      </button>

      {open ? (
        <div
          id="mobile-nav-panel"
          ref={panelRef}
          role="dialog"
          aria-label="Navigation"
          className="absolute left-0 right-0 top-full mt-px border-b border-border bg-background shadow-lg"
        >
          <ul className="mx-auto max-w-6xl px-4 py-3 flex flex-col">
            {/* Search lives here, not in NAV_LINKS — it is an action, not a
                route. The palette's other two entry points are Cmd+K and `/`,
                and a phone has no keyboard, so without this row search is
                unreachable on every touch device below `lg` (README §8:
                every primary target must be reachable from the palette). */}
            <li>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  window.dispatchEvent(new CustomEvent(OPEN_COMMAND_PALETTE_EVENT));
                }}
                className="w-full flex min-h-11 items-center gap-2 rounded-md px-3 text-sm text-foreground-muted hover:text-foreground hover:bg-foreground/5 transition-colors focus-hairline"
              >
                <Search size={16} strokeWidth={1.75} aria-hidden />
                <span>Search</span>
              </button>
            </li>
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
                        ? "flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-foreground bg-foreground/[0.06]"
                        : "flex min-h-11 items-center rounded-md px-3 text-sm text-foreground-muted hover:text-foreground hover:bg-foreground/5 transition-colors"
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
