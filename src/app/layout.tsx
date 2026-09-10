import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import Link from "next/link";

import { BottomTabBar } from "@/components/BottomTabBar";
import { CommandPaletteRoot } from "@/components/command/CommandPaletteRoot";
import { DraftLiveBanner } from "@/components/live/DraftLiveBanner";
import { LiveBanner } from "@/components/live/LiveBanner";
import { MobileNav } from "@/components/MobileNav";
import { NavLinks } from "@/components/NavLinks";
import { NAV_LINKS } from "@/components/nav-active";
import { PwaRegister } from "@/components/pwa/PwaRegister";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  LEAGUE_DESCRIPTION,
  LEAGUE_NAME,
  LEAGUE_YEAR,
  LEAGUE_YEAR_SHORT,
} from "@/config/site";
import { getCommandCoreIndex } from "@/lib/search/command-index";
import { getCurrentLeague, getLiveDraftHandle, getManagers } from "@/lib/data";
import { SITE_URL } from "@/lib/site-url";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["italic"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: `${LEAGUE_NAME} · ${LEAGUE_YEAR}`,
  description: LEAGUE_DESCRIPTION,
};

export const viewport: Viewport = {
  themeColor: "#fafaf9",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { season, league } = await getCurrentLeague();
  const managers = await getManagers(season);
  const liveManagers = managers.list.map((m) => ({
    rosterId: m.rosterId,
    username: m.username,
    displayName: m.displayName,
    avatarUrl: m.avatarUrl,
  }));
  const commandIndex = await getCommandCoreIndex();
  // Null once the newest cached draft is complete, so for most of the year
  // the banner (and its poll loop) is compiled out of the page entirely.
  const liveDraft = await getLiveDraftHandle();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable}`}
      suppressHydrationWarning
    >
      <head>
        <meta name="view-transition" content="same-origin" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');var d=document.documentElement;if(t==='dark'){d.classList.add('dark');}else{d.classList.add('light');}}catch(e){document.documentElement.classList.add('light');}})();`,
          }}
        />
      </head>
      {/* Bottom padding keeps content and the footer clear of the fixed tab
          bar (3.5rem + home-indicator inset) below `lg`. */}
      <body className="antialiased min-h-screen flex flex-col pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-0">
        <header className="sticky top-0 z-30 backdrop-blur-md bg-background/70 border-b border-border">
          <nav className="mx-auto flex max-w-6xl items-center gap-2 px-4 sm:px-6 h-14">
            <Link
              href="/"
              // No aria-label: the visible wordmark text is the accessible
              // name, so it can never drift out of sync with the screen.
              // Lighthouse label-content-name-mismatch flagged every
              // hand-written variant over whitespace differences. The inner
              // span keeps the baseline alignment while the link grows to 44px.
              className="mr-3 inline-flex min-h-11 items-center group"
            >
              <span className="flex items-baseline gap-1.5">
                <span className="font-display text-[22px] text-foreground leading-none">
                  {LEAGUE_NAME}
                </span>
                <span className="text-[10px] tabular text-foreground-subtle uppercase tracking-[0.18em] pt-0.5">
                  &rsquo;{LEAGUE_YEAR_SHORT}
                </span>
              </span>
            </Link>

            <NavLinks links={NAV_LINKS} />

            <div className="flex-1" />

            <span
              aria-hidden
              className="hidden lg:inline-flex items-center gap-1 mr-1 px-1.5 py-0.5 rounded border border-rule text-[10px] text-foreground-subtle tabular tracking-wide"
              title="Cmd+K to search"
            >
              <kbd className="font-sans">⌘</kbd>
              <kbd className="font-sans">K</kbd>
            </span>
            <CommandPaletteRoot index={commandIndex} />
            <ThemeToggle />
            <MobileNav />
          </nav>
        </header>

        <div className="flex-1">{children}</div>

        <LiveBanner leagueId={league.league_id} managers={liveManagers} />
        {liveDraft ? (
          <DraftLiveBanner
            draftId={liveDraft.draftId}
            season={liveDraft.season}
            managers={managers.list}
          />
        ) : null}
        <PwaRegister />

        <footer className="mt-16 border-t border-border">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between text-[11px] text-foreground-subtle">
            <span>
              <span className="kicker kicker-muted">Built for</span>{" "}
              <span className="font-display text-[15px] text-foreground-muted">{LEAGUE_NAME}</span>
              {" · "}
              static build · refreshed every 6h in-season, less often off-season
            </span>
            <span className="flex items-center gap-4 tabular">
              <Link
                href="/constitution"
                className="inline-flex min-h-11 lg:min-h-0 items-center hover:text-foreground transition-colors focus-hairline"
              >
                Constitution
              </Link>
              <span>Data via Sleeper + FantasyCalc</span>
            </span>
          </div>
        </footer>

        <BottomTabBar />
      </body>
    </html>
  );
}
