"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import type { FeedTxType } from "@/lib/data";

export interface ManagerOption {
  username: string;
  displayName: string;
  count: number;
}

interface Props {
  options: ManagerOption[];
  selected: string | null;
  type: "all" | FeedTxType;
}

function buildHref(type: "all" | FeedTxType, manager: string | null): string {
  const params = new URLSearchParams();
  if (type !== "all") params.set("type", type);
  if (manager) params.set("manager", manager);
  const qs = params.toString();
  return qs ? `/transactions?${qs}` : "/transactions";
}

export function ManagerFilterDropdown({ options, selected, type }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  return (
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-2 text-xs text-foreground-muted">
        <span className="uppercase tracking-[0.18em] text-[10px] text-foreground-subtle">
          Manager
        </span>
        <select
          name="manager"
          value={selected ?? ""}
          disabled={isPending}
          onChange={(e) => {
            const next = e.target.value || null;
            startTransition(() => {
              router.replace(buildHref(type, next), { scroll: false });
            });
          }}
          className="rounded-md border border-border bg-surface text-xs text-foreground px-2 py-1 focus:outline-none focus:border-border-strong"
        >
          <option value="">All managers</option>
          {options.map((o) => (
            <option key={o.username} value={o.username}>
              @{o.username} ({o.count})
            </option>
          ))}
        </select>
      </label>
      {selected ? (
        <Link
          href={buildHref(type, null)}
          scroll={false}
          className="text-[11px] text-foreground-subtle hover:text-foreground transition-colors"
        >
          clear
        </Link>
      ) : null}
    </div>
  );
}
