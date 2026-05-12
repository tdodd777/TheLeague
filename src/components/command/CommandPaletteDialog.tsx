"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { CommandItem } from "@/lib/search/command-index";

interface ScoredItem {
  item: CommandItem;
  score: number;
}

/**
 * Tiny fuzzy match: every query character must appear in the haystack in
 * order. Score rewards earlier matches and shorter spans — good enough for
 * a 500-row palette without an external dep.
 */
function fuzzyScore(haystack: string, query: string): number | null {
  if (!query) return 0;
  let hi = 0;
  let firstIdx = -1;
  let lastIdx = -1;
  for (let qi = 0; qi < query.length; qi++) {
    const qc = query[qi]!;
    let found = -1;
    for (; hi < haystack.length; hi++) {
      if (haystack[hi] === qc) {
        found = hi;
        hi++;
        break;
      }
    }
    if (found < 0) return null;
    if (firstIdx < 0) firstIdx = found;
    lastIdx = found;
  }
  const span = lastIdx - firstIdx + 1;
  return -(firstIdx * 2 + (span - query.length));
}

const KIND_LABEL: Record<CommandItem["kind"], string> = {
  page: "Page",
  manager: "Manager",
  season: "Season",
  player: "Player",
  matchup: "Matchup",
};

interface Props {
  coreIndex: CommandItem[];
  onClose: () => void;
}

/** Module-level cache so the players slice is fetched once per session. */
let cachedPlayers: CommandItem[] | null = null;
let inflight: Promise<CommandItem[]> | null = null;

async function loadPlayerIndex(): Promise<CommandItem[]> {
  if (cachedPlayers) return cachedPlayers;
  if (inflight) return inflight;
  inflight = fetch("/api/command-index/players", { cache: "force-cache" })
    .then((r) => (r.ok ? (r.json() as Promise<CommandItem[]>) : []))
    .then((items) => {
      cachedPlayers = items;
      inflight = null;
      return items;
    })
    .catch(() => {
      inflight = null;
      return [];
    });
  return inflight;
}

export function CommandPaletteDialog({ coreIndex, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [players, setPlayers] = useState<CommandItem[]>(() => cachedPlayers ?? []);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    loadPlayerIndex().then((items) => {
      if (!cancelled) setPlayers(items);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const fullIndex = useMemo<CommandItem[]>(
    () => [...coreIndex, ...players],
    [coreIndex, players],
  );

  const matches = useMemo<ScoredItem[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return fullIndex.slice(0, 30).map((item) => ({ item, score: 0 }));
    }
    const out: ScoredItem[] = [];
    for (const item of fullIndex) {
      const score = fuzzyScore(item.haystack, q);
      if (score !== null) out.push({ item, score });
    }
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, 30);
  }, [query, fullIndex]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  const handleEnter = useCallback((): void => {
    const hit = matches[active]?.item;
    if (!hit) return;
    onClose();
    router.push(hit.href);
  }, [matches, active, onClose, router]);

  const handleListKey = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>): void => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => Math.min(matches.length - 1, i + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        handleEnter();
      }
    },
    [matches.length, handleEnter],
  );

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const node = list.children[active] as HTMLElement | undefined;
    if (node) node.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4"
      onKeyDown={handleListKey}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-background/70 backdrop-blur-sm"
      />
      <div className="relative w-full max-w-xl rounded-xl border border-border bg-surface-elevated shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border px-3 h-11">
          <span className="text-foreground-subtle text-xs">⌘K</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search managers, seasons, players…"
            className="flex-1 bg-transparent border-0 outline-none text-sm text-foreground placeholder:text-foreground-subtle"
          />
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-foreground-subtle hover:text-foreground"
          >
            Esc
          </button>
        </div>
        <ul
          ref={listRef}
          role="listbox"
          className="max-h-[50vh] overflow-y-auto py-1"
        >
          {matches.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-foreground-subtle">
              No matches
            </li>
          ) : (
            matches.map(({ item }, i) => (
              <li key={item.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => {
                    onClose();
                    router.push(item.href);
                  }}
                  className={`w-full text-left flex items-baseline gap-3 px-3 py-2 text-sm ${
                    i === active
                      ? "bg-foreground/[0.06] text-foreground"
                      : "text-foreground-muted"
                  }`}
                >
                  <span className="text-[10px] uppercase tracking-widest text-foreground-subtle w-16 shrink-0">
                    {KIND_LABEL[item.kind]}
                  </span>
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.sub ? (
                    <span className="text-xs text-foreground-subtle truncate">
                      {item.sub}
                    </span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
        <div className="border-t border-border px-3 py-2 flex items-center gap-3 text-[10px] text-foreground-subtle">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}

export default CommandPaletteDialog;
