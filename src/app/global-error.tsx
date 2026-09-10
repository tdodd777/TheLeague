"use client";

import { Geist, Instrument_Serif } from "next/font/google";

import "./globals.css";

// Why this file exists alongside `error.tsx`:
//
// In the App Router, `app/error.tsx` wraps its CHILDREN, not `app/layout.tsx`.
// Everything the root layout mounts itself is OUTSIDE it: LiveBanner,
// MobileNav, ThemeToggle, CommandPaletteRoot, PwaRegister. LiveBanner's
// `useLiveMatchups` polls api.sleeper.app every 30s and JSON.parses the
// response, which makes it the most likely runtime thrower on an otherwise
// fully prerendered site, and `error.tsx` cannot see it. `global-error.tsx`
// replaces the root layout entirely, so it is the only boundary that can.
//
// Because it replaces the layout, it must render its own <html> and <body>,
// and it gets none of the layout's fonts, tokens or theme-init script. It
// therefore loads globals.css and the fonts itself, imports nothing from
// `@/components/ui` (error boundaries land in every segment's client
// reference manifest), and reads only `error.digest` so it cannot itself
// throw and take the page down with it.

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["italic"],
  display: "swap",
});

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * The theme class lives on <html>, put there by the root layout's inline
 * script. This component re-renders <html> itself, so read the class back off
 * the live element rather than blowing it away and flashing light-on-dark.
 * Falls back to the CSS default (light) during any server render.
 */
function currentThemeClass(): string {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  return (
    <html
      lang="en"
      className={`${currentThemeClass()} ${geistSans.variable} ${instrumentSerif.variable}`}
      suppressHydrationWarning
    >
      <body className="antialiased min-h-screen">
        <main className="mx-auto max-w-6xl px-4 sm:px-6 pt-14 pb-16 sm:pt-20 flex flex-col gap-6">
          <span className="kicker">Game called</span>
          <h1 className="font-display text-foreground text-[3rem] sm:text-[5rem] leading-[0.95] tracking-tight max-w-3xl">
            The whole broadcast went down.
          </h1>
          <p className="text-foreground-muted text-base sm:text-[17px] leading-relaxed max-w-2xl">
            Something outside the page itself broke, most likely the live score
            feed. Nothing in the record moved: standings, receipts, and every
            trade the twelve of you have ever made are still in the archive.
            Run it back, or reload the front page.
          </p>
          <div className="editorial-rule mt-2" aria-hidden>
            ❦
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => reset()}
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-background focus-hairline"
            >
              Run it back
            </button>
            {/* Plain anchor, not next/link. The router lives in the layout that
                just crashed, so a full document load is the reliable recovery.
                The lint rule can't see that this file replaces the root layout;
                swapping in <Link> here would trade a working escape hatch for a
                second failure on the page whose job is surviving the first. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-border px-4 text-sm text-foreground-muted hover:text-foreground transition-colors focus-hairline"
            >
              Front page
            </a>
          </div>

          {error.digest ? (
            <p className="text-[11px] text-foreground-subtle tabular">
              Reference {error.digest}
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
