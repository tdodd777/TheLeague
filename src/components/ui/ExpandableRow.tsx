"use client";

import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";

import { cn } from "@/lib/cn";

interface ExpandableRowProps {
  trigger: ReactNode;
  children: ReactNode;
  /** Optional className applied to the outer wrapper. */
  className?: string;
  /** Render the chevron indicator on the right. Default true. */
  showChevron?: boolean;
  /** ARIA label for the toggle button. */
  label?: string;
  /** Initial open state. Default false. */
  defaultOpen?: boolean;
}

export function ExpandableRow({
  trigger,
  children,
  className,
  showChevron = true,
  label,
  defaultOpen = false,
}: ExpandableRowProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={cn("flex flex-col", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={label ?? (open ? "Collapse details" : "Expand details")}
        className="text-left w-full group flex items-center gap-2"
      >
        <span className="flex-1 min-w-0">{trigger}</span>
        {showChevron ? (
          <ChevronDown
            size={14}
            strokeWidth={1.75}
            className={cn(
              "shrink-0 text-foreground-subtle transition-transform duration-200 group-hover:text-foreground-muted",
              open && "rotate-180",
            )}
          />
        ) : null}
      </button>
      {/* CSS-only collapse: animating grid-template-rows from 0fr to 1fr is
          composited (no layout thrash). The inner min-h-0 + overflow-hidden
          lets the row collapse without clipping the natural height. */}
      <div
        className="grid transition-[grid-template-rows,opacity] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]"
        style={{
          gridTemplateRows: open ? "1fr" : "0fr",
          opacity: open ? 1 : 0,
        }}
        aria-hidden={!open}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="pt-2.5">{children}</div>
        </div>
      </div>
    </div>
  );
}
