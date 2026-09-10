"use client";

import Link from "next/link";
import { useTransition } from "react";

// Direct import, not the `@/components/ui` barrel. Error boundaries land in
// every segment's client reference manifest, and next.config.ts's
// optimizePackageImports only covers lucide-react — going through the barrel
// would drag DataTable, ScatterPlot, BracketView, StackedBar and AwardsPodium
// into the shared client graph on every route.
import { Skeleton } from "@/components/ui/Skeleton";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorBoundary({ error, reset }: ErrorProps) {
  const [retrying, startRetry] = useTransition();

  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-6 pt-14 pb-16 sm:pt-20 flex flex-col gap-6">
      <span className="kicker">Blown coverage</span>
      <h1 className="font-display text-foreground text-[3rem] sm:text-[5rem] leading-[0.95] tracking-tight max-w-3xl">
        This page dropped the ball.
      </h1>
      <p className="text-foreground-muted text-base sm:text-[17px] leading-relaxed max-w-2xl">
        Something broke while the league data was being laid out. Nothing in the
        record moved: standings, receipts, and every trade the twelve of you
        have ever made are still in the archive. Run it back, or take the front
        page.
      </p>
      <div className="editorial-rule mt-2" aria-hidden>
        ❦
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => startRetry(reset)}
          disabled={retrying}
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-background focus-hairline disabled:opacity-60"
        >
          {retrying ? "Running it back" : "Run it back"}
        </button>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-border px-4 text-sm text-foreground-muted hover:text-foreground transition-colors focus-hairline"
        >
          Front page
        </Link>
      </div>

      {retrying ? (
        <div className="flex flex-col gap-3 border-y border-rule py-4" aria-busy>
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-3 w-5/6" />
        </div>
      ) : null}

      {error.digest ? (
        <p className="text-[11px] text-foreground-subtle tabular">
          Reference {error.digest}
        </p>
      ) : null}
    </main>
  );
}
