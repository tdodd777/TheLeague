"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";

import { Kbd } from "@/components/ui";
import type { CommandItem } from "@/lib/search/command-index";

interface Props {
  index: CommandItem[];
}

// Dialog body is loaded only when the user actually opens the palette. Keeps
// the fuzzy-match + dialog markup out of the initial layout chunk shipped on
// every page.
const CommandPaletteDialog = dynamic(
  () =>
    import("./CommandPaletteDialog").then(
      (mod) => mod.CommandPaletteDialog,
    ),
  { ssr: false },
);

export function CommandPaletteRoot({ index }: Props) {
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;

      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === "/" && !isTyping) {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden md:inline-flex items-center gap-2 h-8 px-2.5 rounded-md border border-border text-xs text-foreground-subtle hover:text-foreground hover:border-border-strong transition-colors"
        aria-label="Search"
      >
        <span>Search</span>
        <Kbd>⌘K</Kbd>
      </button>

      {open ? (
        <CommandPaletteDialog coreIndex={index} onClose={close} />
      ) : null}
    </>
  );
}
