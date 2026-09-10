# Architecture

Deep-dive companion to the [README](./README.md). Read the relevant section before larger changes. The design system in particular is the visual contract, and drift accumulates fast.

## 1. What it is

A multi-season archive and live-season analytics layer for one dynasty (or redraft) Sleeper league. Sleeper covers transactions, lineup-setting, and chat. This site covers the analytics and history Sleeper doesn't expose: dynasty rankings with proper roster valuation, expected wins, head-to-head receipts, the records book.

**Target use:** owners on a phone, mid-season, often with NFL games on. The site doesn't teach fantasy football. It settles arguments.

**Brand posture:** considered, specific, sharp. Editorial typographic spine plus terminal-precise data. No SaaS-cream, no rounded-card cushion, no decorative gradient.

### Anti-references

Hard avoids:

- ESPN / Yahoo / NFL.com fantasy chrome (banner ads, team-color clutter, gamified badges).
- Sleeper's own chunky-pill mobile-app feel, position color codes, team-logo wallpaper.
- Generic SaaS dashboard (tinted card on tinted card, hero-metric template, identical card grids, gradient-icon tiles).
- Crypto / sportsbook neon (gradient buttons, glowing borders, animated tickers).

Soft avoid: an unmodified Linear / Vercel / Stripe-blog clone. If a screen could appear unchanged in a Linear marketing template, it's wrong. Differentiation comes from editorial typography (display serif italic kickers and section breaks carrying real weight), tabular numerals as a typographic feature, and density that trusts the reader.

## 2. Configuration

Single env var:

```bash
# .env
SLEEPER_LEAGUE_ID=<your league id>
```

Everything league-specific is auto-derived from `/league/{id}`. Never hardcode `numQbs`, `numTeams`, `ppr`, dynasty flag, or historical league_ids. The seams for fork-friendliness:

- `src/lib/sleeper/league-chain.ts:walkLeagueChain`: chains backward via `previous_league_id` until null/0.
- `src/lib/fantasycalc/client.ts:deriveParamsFromLeague`: derives `{ numQbs, numTeams, ppr }` from the league response (`isDynasty` is supplied by the caller; ingest calls it twice, once `true` and once `false`, to fetch both value sets every build).

### Per-league overrides (not from Sleeper)

| File | Contents |
|---|---|
| `src/config/site.ts` | League name, year, tagline, meta description. |
| `src/config/managers.ts` | Per-manager bio overrides keyed by Sleeper `user_id` (real name, location, bio, mode, rival, philosophy, contact, accent color). |
| `src/app/globals.css` | Accent color tokens (`--accent-primary`, light + dark variants). |
| `src/config/about.ts` | `LEAGUE_BLURB` for the editorial off-season hero. |
| `src/config/constitution.mdx` | League rules, scoring, dues, tiebreakers. |
| `public/managers/` | Manager photos. |

Auto-derived FantasyCalc params: `?isDynasty={true|false}&numQbs={1|2}&numTeams={6..16}&ppr={0..1}`.

Optional: `SITE_URL` (see `src/lib/site-url.ts` below) fixes the absolute origin used for OG images, `robots.txt`, and `sitemap.xml` when the host doesn't set one of the fallbacks the app already knows.

## 3. Data flow

Single-tenant league site, $0 hosting. **Three data lifetimes coexist**, pick the right one and never the wrong one:

1. **Build-time / committed.** `scripts/ingest.ts` and the optional `.github/workflows/refresh-data.yml` cron pull Sleeper + FantasyCalc and write JSON to `/data/`. RSC pages read these files via `src/lib/data/cache.ts` (no DB, no runtime API calls).
2. **Static render.** Every historical page is pre-rendered. `src/lib/data/*` is **server-only** (uses `node:fs`); never import it from a client component.
3. **Client live polling.** Only when there's something live to watch. `src/components/live/` polls Sleeper directly from the browser (CORS open): `useLiveMatchups` on game days, `useLiveDraft` while a rookie draft is running. No `/api/*` proxy exists for either.

**Architecture contract:** if you find yourself writing a runtime API route to fetch data, you're doing it wrong: the answer is almost always "snapshot it in `scripts/ingest.ts` and read the JSON in an RSC."

**The one exception:** `src/app/api/command-index/players/route.ts` is a route handler under `/api`, but `dynamic = "force-static"` makes it a build-time-only export: Next renders it once to a static JSON file, same as any other prerendered route, and it answers zero requests at runtime. It exists to keep the ~500-player, ~80 KiB command-palette index out of every page's initial HTML; the client fetches it once, lazily, the first time Cmd+K opens (`CommandPaletteDialog.tsx`), and browser-caches it. The small core index (pages, managers, seasons, matchup weeks; `getCommandCoreIndex` in `src/lib/search/command-index.ts`) still ships inline in the layout, so the palette answers instantly before that fetch lands.

```
            ┌──────────────┐   ┌──────────────┐
            │ Sleeper API  │   │ FantasyCalc  │
            └──────┬───────┘   └──────┬───────┘
                   ▼                  ▼
        ┌──────────────────────────────────────┐
        │ GitHub Actions cron (optional)       │
        │ (every 6h in-season, daily off)      │
        │ - Walks previous_league_id chain     │
        │ - Snapshots FantasyCalc to /data/    │
        │ - Triggers Netlify build hook        │
        └──────────────────┬───────────────────┘
                           ▼
              ┌──────────────────────────┐
              │ Next.js static build     │
              │ All historical pages     │
              │ pre-rendered, /api/      │
              │ command-index/players    │
              │ exported to static JSON  │
              └──────────────┬───────────┘
                             ▼
                        Client (PWA)
        ┌──────────────────────────────────────┐
        │ On game days: useLiveMatchups polls  │
        │ Sleeper every 30s for live scoring.  │
        │ While a rookie draft is running:     │
        │ useLiveDraft polls the draft + picks │
        │ + traded_picks endpoints, seconds to │
        │ minutes depending on draft status.   │
        └──────────────────────────────────────┘
```

### Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15 (App Router, RSC) | Streaming UI, server components keep player data off the client bundle. |
| Language | TypeScript strict (no `any`) | Sleeper responses are well-shaped; types prevent string-vs-number bugs. |
| Styling | Tailwind v4 + hand-rolled UI primitives | Tokens in `globals.css` `@theme inline`. Components in `src/components/ui/` are bespoke (no shadcn). |
| Animation | Native View Transitions API + tokenized CSS transitions | No Framer / Motion library. Total page motion budget ≤250ms. |
| Charts | Bespoke SVG primitives (Sparkline, ScatterPlot, StackedBar) | No Recharts. Trend-tinted strokes baked into Sparkline; ScatterPlot doubles as the contender-quadrant chart with optional median crosshairs and quadrant labels. |
| Hosting | Netlify (or Vercel) | Free tier, build hooks. |
| Build cron | GitHub Actions | Free, scheduled rebuilds via Netlify build hook. |
| Storage | Git-ignored `/data/` snapshots, regenerated by `npm run ingest` | Player metadata + value snapshots; no DB. |
| Tests | Node's built-in `node:test` via `tsx --test` | No Jest/Vitest dependency. Pure-function and fault-injection coverage only (see §8). |

## 4. Project structure

```
data/
  players.json                  ~18 MB Sleeper player metadata (gitignored, regen via ingest)
  values-snapshots/<date>.json  FantasyCalc dynasty + redraft values (gitignored, regen via ingest)
  league-cache/<season>/        league.json, users, rosters, traded_picks,
                                drafts, matchups-NN.json (played weeks only:
                                0-point schedule stubs and weeks with no
                                scheduled matchups are skipped),
                                transactions-NN.json,
                                projections-NN.json (slim: pts_ppr only),
                                winners_bracket.json, losers_bracket.json
                                (gitignored, regen via ingest)
  .backups/<run-id>/            Transient: parked live copies + a journal.json
                                during a promotion swap. Cleaned up when the
                                swap finishes; left behind only by a crash
                                mid-promotion, and swept by the next run.
src/
  app/                           App Router routes
    api/command-index/players/  The one /api/* route: force-static, see §3
    error.tsx                   Segment-level error boundary
    global-error.tsx            Root-layout-replacing error boundary
    transactions/trades/
      page.tsx                  Trade log, page 1 (canonical URL)
      pageSize.ts                TRADES_PAGE_SIZE + tradesTotalPages, shared by
                                  the two page files and sitemap.ts
      page/[page]/page.tsx       Trade log, pages 2+ (dynamicParams = false)
  components/
    command/                    Cmd+K palette
    landing/                    Home page charts (HomeVisuals, BarList)
    live/                       Game-day + live-draft client polling
      LiveScoreboard.tsx, useLiveMatchups.ts    Game-day matchup polling
      LiveBanner.tsx                             Site-wide "closest game" pill
      LiveDraftRoom.tsx, useLiveDraft.ts          Live draft-room polling
      DraftLiveBanner.tsx                        Site-wide "draft is live" pill
      draft-clock.ts                              Shared pure logic: who's on
                                                    the clock, slot math, pick
                                                    labels, used by both the
                                                    room and the banner
    rankings/                   MetricExplainer, RankingsCaveats, palette,
                                 RosterValueSection, TeamOverviewCard,
                                 TeamOverviewSwitcher (see §6)
    ui/                         Card, DataTable, StatTile, Pill, Sparkline,
                                 Skeleton, Pagination, RankRing, ScatterPlot, ...
    pwa/PwaRegister.tsx          Registers public/sw.js
    BottomTabBar.tsx             Phone-only bottom tab bar (< lg)
    NavLinks.tsx                Desktop nav (active highlight)
    MobileNav.tsx                Mobile hamburger nav (active highlight)
    nav-active.ts                 NAV_LINKS (single source of truth for the
                                   primary nav) + isActiveNav(href, pathname)
  config/                       Per-league overrides (see §2)
  lib/
    data/                       Flat re-export API (server-only). Use this, don't re-read JSON ad hoc.
    sleeper/                    Sleeper client + types + league-chain walker
    fantasycalc/                FantasyCalc client (deriveParamsFromLeague, tepMultiplier, pick-name, pick-resolver)
    rankings/                   engine.ts, lineup-optimizer.ts, team-strength.ts,
                                 week-strength.ts, quadrant.ts (see §6)
    landing/                    insights.ts (Sunday-mode strip), visuals.ts
                                 (home page chart data)
    search/                     command-index.ts
    site-url.ts                 SITE_URL: single source for the site's
                                 absolute origin (OG images, robots, sitemap)
    types.ts                    Domain types (post-transformation)
public/
  sw.js                         Hand-written service worker (versioned cache; bump VERSION on shell change)
  managers/                     Manager photos
scripts/
  ingest.ts                     Build-time data pull. Stages every season into
                                 a scratch dir, validates the staged bytes
                                 against what's already live (refuses to
                                 promote anything smaller, see the
                                 `validateAgainstLive` comment in the file),
                                 then swaps staged → live with a journaled,
                                 resumable rename sequence (`promoteAll` /
                                 `recoverInterruptedPromotions`) so a crash
                                 mid-write can't leave a season half-updated.
  *.test.ts                     Unit tests, run via `npm test` (see §8)
```

`src/lib/data/` is the canonical reader (`getCurrentLeague`, `getManagers`, `getStandings`, `readMatchups`, etc.). New consumers pull from there.

### Type system

Three layers, kept separate:

- `src/lib/sleeper/types.ts`: Sleeper response shapes.
- `src/lib/fantasycalc/types.ts`: FantasyCalc response shapes.
- `src/lib/types.ts`: domain types (`Manager`, `Roster`, `Matchup`, `Transaction`, `RankedManager`).

Path alias: `@/*` → `src/*`.

## 5. Routes

```
/                                  Home: Sunday-mode in-season, editorial off-season (auto-switch)
/standings                         Standings: display-italic ordinals + 1px playoff/demotion rules
/matchups                          Redirects to latest cached week
/matchups/[season]/[week]          Matchup detail
/managers                          Manager directory (hairline-row list)
/managers/[username]               Manager profile (bio, career, team overview switcher, current roster)
/transactions                      All transactions, filterable
/transactions/trades                Trades, page 1 (canonical), 10 per page
/transactions/trades/page/[page]    Trades, pages 2+ (statically enumerated; anything past the last page 404s)
/transactions/trades/[id]          Trade detail with historical fairness
/drafts                            Redirects to /drafts/{latest completed year}
/drafts/[year]                     Canonical drafts surface: year pills nav between years; live draft room takes over on the current year while a rookie draft is running
/records                           All-time records
/history                           Season-by-season history index
/history/[year]                    Specific season recap
/awards                            Champion gallery + accolades
/h2h                               H2H heatmap on desktop (N×N matrix, display-italic headers); one-manager-at-a-time list on phone (H2HMobileList)
/h2h/[u1]/[u2]                     Specific rivalry page
/rankings/season                   Season power rankings
/rankings/dynasty                  Dynasty power rankings (top-3 accent ordinals; tap-to-reveal stud breakdown)
/rankings/quadrant                 Contender quadrant chart
/rankings/trend                    30-day trend per team
/constitution                      League constitution (MDX)
/not-found                         Voiced 404 (custom, never let regress to Next.js default)

/sitemap.xml, /robots.txt          SEO metadata (both derive the origin from SITE_URL, see §3)
/opengraph-image, /icon, /apple-icon, /manifest.webmanifest  Generated brand images + PWA manifest
/api/command-index/players         Build-time-only static JSON export, see §3 (not a runtime endpoint)
```

`app/error.tsx` and `app/global-error.tsx` aren't routes: they're error boundaries. See "Error boundaries" under §6/§8 for why there are two.

No `/api/*` runtime routes for data fetching (the one static export above aside). Live polling on game days and during a rookie draft hits Sleeper directly from the client.

### Non-obvious route behavior

- **`/`** auto-switches between Sunday-mode (in-season) and editorial mode (off-season). Sunday-mode promotes the `playoffRace` and `dynastyMover` insights from `src/lib/landing/insights.ts` into a first-class type-only `SundayStrip` rendered between the live scoreboard and recent moves; the Pulse drops to 3 cards and the Lede moves below the fold. Off-season keeps the original Lede-leads order. Both modes render `HomeVisuals` (§6) beneath the fold: this week's projected-lineup bars, the 30-day dynasty value swing, and the contender quadrant, each best-effort and simply omitted if its inputs aren't available.
- **`/drafts`** redirects (server-side via `next/navigation`) to `/drafts/{latest}`. The year page is the canonical drafts surface; on the current year, while Sleeper reports the draft as anything but `complete`, `LiveDraftRoom` renders above the static upcoming-order section and takes over the story.
- **Live game-day mode** auto-detects from `state/nfl.season_type === "regular"` plus an unfinished current-week matchup (day-agnostic: Sunday, TNF, MNF all trigger it).
- **Live draft mode** is independent of game-day mode and can run during the off-season. `getLiveDraftHandle()` (`src/lib/data/drafts.ts`) reads the newest cached season's draft and returns a handle only when the last ingest saw it incomplete; when it's `null` the root layout compiles `DraftLiveBanner` and its poll loop out of the page entirely for the rest of the year.
- **`/transactions/trades` pagination is path-based, not query-based.** Under `dynamic = "force-static"`, Next resolves `searchParams` to `{}` at build time, so a `?page=N` link would silently serve page 1 for every `N`. A `next.config.ts` redirect sends old `?page=N` links (indexed, bookmarked) to `/transactions/trades/page/N`. `TRADES_PAGE_SIZE` and `tradesTotalPages()` live in `pageSize.ts` because a Next `page` file may only export from Next's known export set, so neither route file can own the constant for the other; `sitemap.ts` reads it too, to declare the paged URLs.
- **Cmd+K palette** (`src/components/command/`) indexes managers, players, weeks, seasons via `src/lib/search/command-index.ts`: the core index ships inline, the heavier player index is fetched from `/api/command-index/players` on first open (see §3).
- **Nav active state** matches by **first path segment** so `/rankings/season` highlights "Rankings" (whose href is `/rankings/dynasty`). `NavLinks.tsx`, `MobileNav.tsx`, and `BottomTabBar.tsx` all share `NAV_LINKS`/`isActiveNav` from `nav-active.ts`; a route added to the nav is added once.

### Sleeper API endpoints used

All read-only, no auth. Base `https://api.sleeper.app/v1`:

`/league/{id}`, `/league/{id}/users`, `/league/{id}/rosters`, `/league/{id}/matchups/{week}`, `/league/{id}/winners_bracket`, `/league/{id}/losers_bracket`, `/league/{id}/transactions/{round}`, `/league/{id}/traded_picks`, `/league/{id}/drafts`, `/draft/{id}`, `/draft/{id}/picks`, `/draft/{id}/traded_picks`, `/state/nfl`, `/players/nfl`, `/projections/nfl/regular/{year}/{week}`.

## 6. Rankings system

Four views, one engine, two API calls (one dynasty, one season). Engine in `src/lib/rankings/engine.ts`.

| View | Question | Inputs |
|---|---|---|
| `/rankings/season` | Who is best positioned to win **this year**? | Season values + actual season performance |
| `/rankings/dynasty` | Who has the best long-term roster? | Dynasty values + future picks |
| `/rankings/quadrant` | Where does each team sit on the now-vs-future spectrum? | Both rankings, plotted (median split) |
| `/rankings/trend` | Whose roster is gaining or losing value? | Per-player 30-day deltas, rolled up |

### Data source: FantasyCalc

`GET https://api.fantasycalc.com/values/current?isDynasty=&numQbs=&numTeams=&ppr=`

Free, no auth, returns Sleeper player IDs as the join key. Picks come back as entries in the same array with `sleeperId: null` and `player.name` formatted as either:

- `"YYYY Pick R.PP"`: exact slot, used for the upcoming rookie-draft year (e.g. `"2026 Pick 1.04"`). All slots present once draft order is determinable.
- `"YYYY Nth"`: round-only, used for years 2-4 (e.g. `"2027 1st"`).

No Early/Mid/Late tiering exists in the API. Pick lookups are always exact-slot: the parser in `src/lib/fantasycalc/pick-name.ts` is the source of truth. `DEFAULT_FUTURE_PICK_SLOT = 7` is the round-only fallback for years past the next draft.

### Auto-detection from league settings

```
numQbs    = 2 if "SUPER_FLEX" in roster_positions else 1
numTeams  = total_rosters
ppr       = scoring_settings.rec
tep_active = scoring_settings.bonus_rec_te > 0
```

**TEP correction.** FantasyCalc's API does not accept a TEP param. When `bonus_rec_te > 0`, `tepMultiplier` in `src/lib/fantasycalc/client.ts` is applied **post-fetch** to TE values: `1 + bonus_rec_te × 0.5`. Approximation, called out in the rankings caveats footer.

### Pick portfolio resolution

For each manager:

1. Start with original picks (N years × draft_rounds picks per manager).
2. Remove picks traded away (`traded_picks` where `previous_owner_id == manager_roster_id` and `owner_id != manager_roster_id`).
3. Add picks acquired (where `owner_id == manager_roster_id` and `previous_owner_id != manager_roster_id`).
4. Assign exact slot (real draft order if known; `DEFAULT_FUTURE_PICK_SLOT` otherwise). Resolve via `buildPickValueIndex` + `resolvePickValue` in `src/lib/fantasycalc/pick-resolver.ts`.

Canonical key: `${season} Pick ${round}.${slot.padStart(2, "0")}` (e.g. `"2026 Pick 1.04"`). Round-only fallback key: `${season}-${round}`.

### Roster value formula (powers Dynasty Power Rankings)

```
1. Optimal starting lineup
   Fill mandatory slots with best player at position; FLEX = best remaining RB/WR/TE;
   SUPER_FLEX = best remaining QB/RB/WR/TE. "Best" by dynasty value (dynasty mode) or
   season value (season mode). Optimizer in src/lib/rankings/lineup-optimizer.ts.

2. Tier weights
   starter_value = sum of starters' values    × 1.0
   bench_value   = sum of next 5 best benches × 0.5
   reserve_value = sum of remaining bench/IR  × 0.2
   taxi_value    = sum of taxi squad players  × 0.4   (dynasty only)
   pick_value    = sum of future picks        × 1.0

3. Stud bonus (KTC-style stud weighting, made explicit)
   stud_bonus = sum over starters of: max(0, value − 6000) × 0.15

4. Total
   roster_value = starter + bench + reserve + taxi + pick + stud_bonus
```

6000 ≈ top-24 player overall on FantasyCalc's dynasty scale. Multipliers and threshold are tunable heuristics.

### Season power formula

Different goal: "who wins THIS year." Blends forward-looking strength with results.

```
optimal_starter_season_value = lineup optimized using REDRAFT values
ppg_index = (points_for / games_played) / league_avg_ppg
last3 = avg points last 3 weeks / league_avg_ppg
all_play_pct = wins if you played every other team this week, summed across weeks

season_power = (optimal_starter_season_value / 10000) × 40
             + ppg_index                              × 30
             + last3                                  × 20
             + all_play_pct                           × 10
```

Pre-season (week 0), the last three components are zero: pure value-based. All-play delta vs. actual record is itself a feature ("you got robbed by the schedule").

### Contender quadrant

`src/lib/rankings/quadrant.ts` computes this once and is consumed by both `/rankings/quadrant` and the home page (`HomeVisuals`, below), so the two always draw the same picture. X = season power, Y = dynasty power. Splits on **league median** (not mean: one elite team would warp a mean split).

- Top-right: **Contenders** (great now AND later)
- Top-left: **Rebuilders** (bad now, stockpiled)
- Bottom-right: **Win-Now** (great now, old, window closing)
- Bottom-left: **Stuck** (the danger zone)

Bubble size = avg starter age (smaller = younger). Bubble color = 30-day trend, unless the current month is a suppressed off-season window (see caveat 6 below), in which case every bubble goes flat accent color instead of a noisy green/red.

### Team strength and the team overview card

The dynasty/season rankings answer "how good is this roster, overall." The manager profile page answers the follow-up (*where does that come from*) with a per-position breakdown, computed relative to the other rosters rather than as a standalone number.

- **`src/lib/rankings/team-strength.ts`** (`buildTeamStrengths`) slices any roster into the groups a manager actually thinks in: `QB`, `RB`, `WR`, `TE`, `FLEX`, `DEPTH` (bench + reserve + taxi), `PICKS`. It ranks each slice against every other roster passed in. It's generic over a small `StrengthSource` shape, so the same function ranks dynasty breakdowns, season breakdowns, and the week view below without caring which. K and DEF are deliberately absent: FantasyCalc prices neither, so a K row would rank twelve identical zeroes.
- **`src/lib/rankings/week-strength.ts`** (`loadWeekStrength` / `buildWeekStrengthSources`) builds the same shape from a different source: Sleeper's **projected points** for the lineup a manager has actually *set* for the current NFL week (`roster.starters`, positional by `roster_positions` index), not talent. Leaving a stud on the bench shows up here and nowhere else. Returns `null` off-season or when no projections are cached for the current week.
- **`src/components/rankings/TeamOverviewCard.tsx`** renders one view: a `RankRing` (percentile-sweep arc, `src/components/ui/RankRing.tsx`) for the overall rank, a bar row per strength group, and a horizontally-scrolling strip of the lineup's best players, sorted by value.
- **`src/components/rankings/TeamOverviewSwitcher.tsx`** is the tab shell around 1-3 of those cards (Dynasty / Season / Week N, whichever have data for that manager). It's a thin client component that only tracks which child to show: the cards themselves are server-rendered and passed in as `children`, so the rankings math and FantasyCalc/Sleeper data never enter the client bundle.

Wired together on `/managers/[username]/page.tsx`: dynasty, season, and week breakdowns are each computed (or skipped) independently, and only the views with real data get pushed into `overviewViews` before the switcher renders.

### Edge cases

| Issue | Handling |
|---|---|
| DST | Sleeper uses team abbrev as ID (`"PHI"`); FantasyCalc has these: direct match. |
| Kickers | Generally low value. Treat as bench if rostered. |
| IDPs | FantasyCalc doesn't cover them. Exclude with footnote if league has IDP slots. |
| Taxi | `roster.taxi[]`, ×0.4 multiplier. |
| Reserve / IR | `roster.reserve[]`, ×0.2 multiplier. |
| Empty roster slots | Skip; don't penalize. |
| Players not in FantasyCalc | UDFAs, deep practice squad. Value = 0, `missing: true` flag. |
| Retired / cut still rostered | Same as above. |
| Mid-season league pivot (1QB → SF) | Re-fetch on every build; past matchups stay in original context. |
| Co-managers | Multiple owners per roster allowed. Rankings are per-roster, not per-user. |

### Caveats (rankings page footer)

1. Values are crowd-sourced/algorithmic, not predictions.
2. TEP is approximated post-fetch.
3. Future pick positions default to slot 7 (mid-round for 12 teams).
4. IDPs aren't valued.
5. Stud weighting and depth multipliers are opinionated.
6. 30-day trends are noisy off-season: suppress display April through July (`isTrendSuppressed` in `src/lib/rankings/constants.ts`; also what flips the quadrant bubbles to flat accent color and hides the home page's value-swings chart, see below).

### Refresh cadence

| Window | Cadence | Why |
|---|---|---|
| In-season (Sept-Jan) | Every 6 hours | Trade values move daily; rosters change post-trade. |
| Off-season pre-rookie-draft (Apr-Jul) | Daily | Rookie pick values move fast. |
| Off-season quiet (Feb-Mar, Aug) | Every 2-3 days | Minimal change. |

Two FantasyCalc API calls per build (one dynasty, one season). Sleeper roster data refreshes on the same cadence.

### Historical value snapshots (trade fairness)

Trade fairness uses values **at the time of the trade**, not current. Every build snapshots FantasyCalc to `data/values-snapshots/YYYY-MM-DD.json`. Trade detail pages find the snapshot closest to the trade's `status_updated` timestamp. After ~5 years this directory is ~10 MB. Trivial.

### Home page visuals

`src/lib/landing/visuals.ts` (`getHomeVisuals`) builds the three pictures rendered under the masthead by `src/components/landing/HomeVisuals.tsx`: this week's projected lineups league-wide (from `loadWeekStrength`), the contender quadrant (from `buildQuadrant`), and the 30-day swing in dynasty starter value per roster (from `buildDynastyRankings().rosters[].trend30Day`, suppressed in the same off-season window as the rankings trend view). Each of the three is wrapped in its own `attempt()` and independently returns `null` on any failure or missing input rather than taking the rest of the page down; `HomeVisuals` renders only the blocks that came back non-null. Bars are plain divs (`src/components/landing/BarList.tsx`) in two modes: `ranked` (single bar, scaled to the top row) and `diverging` (from a center line, green right / red left), so nothing here pulls in a chart library beyond the `ScatterPlot` the quadrant block reuses.

### Live draft room

The site is statically built, so a prerendered `/drafts/[year]` page can say `pre_draft` for hours after the real draft has started. `src/components/live/` closes that gap the same way `LiveScoreboard` does for live scoring, but for drafts:

- **`useLiveDraft.ts`** polls `/draft/{id}`, and once the draft leaves `pre_draft`, also `/draft/{id}/picks` and `/draft/{id}/traded_picks`, straight from the browser. Cadence follows status: minutes while waiting for the room to open (tighter if the published start time is within the hour), 10s while picks are actively landing, backing off geometrically to a 2-minute ceiling through a lull (this league runs slow, hours-long pick timers) and snapping back immediately on a new pick, a tab regaining focus, or `visibilitychange`. Stops polling entirely once the draft reports `complete`. A finished draft never changes again.
- **`draft-clock.ts`** is the shared pure logic: `draftClock()` resolves which overall pick is next, its round/slot, and which manager actually holds it after trades (checked against `traded_picks`, latest move wins), given Sleeper's own snake-vs-linear slot math (`slotForPick`). Both the room and the banner import this so they can never disagree about whose pick it is.
- **`LiveDraftRoom.tsx`** is the full room, rendered on `/drafts/[year]` for the current year only: a scheduled strip pre-draft, an on-the-clock card with an "up next" strip once picks are live, and a round-grouped, newest-first board of picks made so far (`ExpandableRow` per round, current round open by default).
- **`DraftLiveBanner.tsx`** is the site-wide floating pill (mounted from the root layout, shares its fixed bottom-of-screen slot and z-index with `LiveBanner`'s game-day pill) that shows on every other page while a draft is `drafting` or `paused`. It suppresses itself, and its poll loop, on `/drafts/{that season}`, where the full room is already on screen; the hook's `enabled` flag stops the fetch loop rather than just hiding the render, so the two components can never run two independent poll loops for the same draft.
- The root layout only mounts `DraftLiveBanner` at all when `getLiveDraftHandle()` (`src/lib/data/drafts.ts`) finds an incomplete draft in the newest cached season; for most of the year (draft long since finished) that whole subtree, and its poll loop, is compiled out of the page.

## 7. Design system

The visual contract. When implementation deviates, choose one: amend this section, or revert the implementation. Don't let drift accumulate.

### Theme posture

**Light mode is the default**, dark mode is the well-tuned secondary. First-time visitors land in light regardless of OS preference; the toggle persists their choice in `localStorage.theme`. Both themes must hit WCAG AA.

The theme is **editorial-tech**. What pulls it off the default Linear/Vercel clone: display-italic Instrument Serif as a real spine (kickers, ordinals, names), tabular numerals treated as a typographic feature, density that trusts the reader.

### Tokens

Token *names* are locked. Anything that names a CSS custom property or Tailwind class downstream must use these. Defined in `src/app/globals.css` with a `@theme inline` block exporting them as Tailwind utility colors.

**Surface + structural**

| Token | Notes |
|---|---|
| `--background` | Page background. |
| `--surface` | Card / elevated surface. |
| `--surface-elevated` | Higher-elevation surface (rare). |
| `--surface-glass` | Translucent surface for the sticky header and the floating live-status pills (`LiveBanner`, `DraftLiveBanner`). |
| `--border` | Default border (cards, dividers). |
| `--border-strong` | Stronger border. |
| `--rule` | **Subtler hairline distinct from `--border`.** DataTable + Card row variant. |
| `--row-hover` | Interactive row hover state. Replaces hardcoded `bg-foreground/[0.025]`. |

**Trend + state**

| Token | Notes |
|---|---|
| `--positive`, `--negative`, `--warning` | Semantic colors. |
| `--row-accent-positive` | 1px row left-rule for affirmative state (playoff seed). |
| `--row-accent-negative` | 1px row left-rule for relegation state. |
| `--trend-positive-soft` | Sparkline stroke when net trend is up. Less saturated than `--positive`. |
| `--trend-negative-soft` | Sparkline stroke when net trend is down. |

**Accent (single primary, single secondary, no third accent)**

| Token | Light | Dark |
|---|---|---|
| `--accent-primary` | `#855d12` | `#f5b54a` |
| `--accent-primary-soft` | `rgba(133,93,18,0.10)` | `rgba(245,181,74,0.12)` |
| `--accent-primary-glow` | existing | existing |
| `--accent-secondary` | `#1d7878` | `#3aa9a9` (avatar gradient ring only) |

Amber is the deliberate accent default. Generic sports sites are blue, Sleeper is purple-on-black. Amber appears only on: kickers, top-N ordinals, the avatar gradient ring, `RankRing`'s arc, focus indication, the masthead year tag. Not a decorative wash. Forks should swap the accent in `globals.css` to claim their own.

**Motion**

| Token | Value | Use |
|---|---|---|
| `--motion-instant` | 75ms | Focus, hover, immediate feedback. |
| `--motion-quick` | 150ms | State change, reveal, color shift. |
| view transitions | 220ms | Page-to-page transitions. |
| **Total page motion budget** | **≤250ms** | No animation outlives this. No staggered count-ups. |

### Typography

One serif (display, italic only) + one sans + one mono (reserved). Ratio floor between every step: **1.25**.

| Role | Family | Style |
|---|---|---|
| Display | Instrument Serif | italic 400, kickers, ordinals, manager names, h2+ |
| Body | Geist Sans | 400 / 500 / 600 |
| Mono | Geist Mono | code-style chips (`⌘K`), rare technical contexts |

**Scale** (mobile-first; desktop adds breathing room only at `lg:`):

| Step | Size | Use |
|---|---|---|
| micro | 11px | DataTable headers, kickers, compact ordinals |
| body | 13px | tabular numerals in tables, secondary text |
| ui-emphasis | 15px | primary body, manager record + finish |
| sub | 18px | section subhead, h4 |
| h3 | 24px | secondary section title |
| h2 | 36px | display-italic, Lede headline, Pulse trend titles |
| h1 (mobile) | 56px | page hero (display-italic) |
| hero (desktop) | 96px | page hero `lg:` |
| masthead | 7rem | home wordmark only |

**Numerals.** `tabular-nums` is the rule, not the exception. Every score, record, percent, PF/PA, sparkline tooltip, tier breakdown uses tabular figures. Body already enables `tnum`; component overrides reach for `.tabular`, never default lining.

**Line length.** Prose 65-75ch (Lede block, off-season blurb). Data tables and compact UI: unconstrained.

### Component vocabulary

**Card** (three roles):

| Variant | Use |
|---|---|
| `default` | Genuine secondary blocks (Pulse trend cards, expandable details, `TeamOverviewCard`). `rounded-xl border bg-surface`, `padding` prop (`none`/`sm`/`md`/`lg`, defaults to `md`). |
| `interactive` | Clickable card-as-link. Kept rare. |
| `row` | Hairline rule between siblings, no rounded shell, no background. Optional `rowAccent` prop draws a 1px semantic left rule. |

`as` prop renders the card as `div` / `section` / `article` / `li` (e.g. `<Card as="li" variant="row">` for a ranked list). The `elevated` variant was deleted as dead code. **Don't reintroduce.**

**DataTable**

- No outer card wrapper. Top + bottom hairlines via `--rule`.
- Headers: `text-[11px] font-semibold uppercase tracking-[0.06em]`. Single hairline beneath header row. **No vertical column rules ever.**
- Hover: `--row-hover` token (no inline class).
- `rowAccent?: (row) => "positive" | "negative" | null` prop renders 1px left-rule using `--row-accent-{positive,negative}`. **1px only**: the ban is on side-stripes >1px as decorative accent. 1px as semantic state is allowed.
- **Phone-first contract:** card-stack pattern (e.g. `StandingsMobileCard`, `H2HMobileList`) is the canonical view at `lg:` breakpoint and below. DataTable is desktop-only. Don't make the mobile card a `sm:hidden` fallback.

**Atmosphere is removed.** `src/components/atmosphere/` was deleted in the redesign. Don't reintroduce `Spotlight`, `DotGrid`, or any equivalent decorative wrapper. Visual weight on hero sections comes from vertical whitespace, the `editorial-rule` ornament (`❦`), and display-italic page titles. The one preserved gradient is the per-manager accent radial on `/managers/[username]/page.tsx` (an inline-styled `<div>`, not a component). It's identity, not atmosphere.

**StatTile**: `animate` defaults to `false`. Count-up animation is opt-in per instance, reserved for hero metrics (expectation: zero or one per page).

**Sparkline**: `tintTrend` prop overrides `stroke` with `--trend-{positive,negative}-soft` based on net direction. Prop-driven stroke override stays available for special cases (Lede champion sparkline).

**ScatterPlot**: doubles as the contender-quadrant chart via optional `medianX`/`medianY` crosshairs and a `quadrantLabels` prop (`{tr, tl, br, bl}`) drawn in the plot's four corners once both medians are set. Used plain (no quadrant props) for the dynasty age-vs-value scatter.

**RankRing**: single-arc percentile ring (`src/components/ui/RankRing.tsx`): 1st place fills the ring, last leaves a sliver, so the sweep reads as "share of the league you're ahead of." Color is caller-supplied (rankings pass `rankTone()`, a semantic tone, never a raw hex) and never carries the meaning alone: the ordinal number and caption say the same thing without it.

**Skeleton**: hairline-rule pulse, **not** the default Tailwind shimmer rectangle. Default-Tailwind shimmers are an AI-slop tell.

**Pill** (tones: neutral, positive, negative, accent, secondary, warning). Always ring-1 inset, not filled. Reserved for compact state badges (record `9-3`, finish `1st`, mode tags, "draft paused"). **Not** for ordinals, section headers, or content emphasis: display-italic + accent color handles those.

**EmptyState**: copy teaches, never apologizes. Each empty state names the league context. Default messages like "No data available" or "Nothing here yet" are forbidden.

**BottomTabBar**: phone-only (`lg:hidden`) fixed bottom nav: four core destinations (Home, Matchups, Standings, Rankings), sharing `NAV_LINKS`/`isActiveNav` with the desktop nav so the route set never drifts across the three navs. Sits at `z-20`: above page content and sticky table columns (`z-10`), below the header (`z-30`, so an open mobile menu panel covers it), below the live-status pills and PWA install sheet (`z-40`, both of which float `calc(4.5rem + safe-area-inset-bottom)` above it on phone so they never overlap). The root layout adds matching bottom padding to `<body>` on phone so page content and the footer clear it.

**Team overview switcher**: the tab pattern behind `/managers/[username]`'s Dynasty/Season/Week card: a thin client controller (`TeamOverviewSwitcher`) around server-rendered card children (`TeamOverviewCard`), so which tab is open is the only thing that ever runs on the client. Reach for this split (client visibility toggle, server-rendered content passed as `children`) before writing a client component that re-fetches or re-derives data the server already had.

**Error boundaries** (`app/error.tsx`, `app/global-error.tsx`): voiced, on-brand, never the default Next.js error screen, same posture as the custom 404. `error.tsx` wraps a route segment's children; because the App Router mounts the header, both live-status banners, nav, and footer directly from the root layout, a throw inside one of *those* (in practice, most likely `LiveBanner`'s `useLiveMatchups` JSON-parsing a live response) is invisible to `error.tsx`, and only `global-error.tsx` (which replaces the entire root layout, `<html>`/`<body>` included) can catch it. Both import `Skeleton` directly from its file rather than through the `@/components/ui` barrel: an error boundary lands in every route segment's client reference manifest, and the barrel would drag `DataTable`, `ScatterPlot`, `BracketView`, and every other heavy `ui/` component into the shared client graph on every route just to reach one of them. `global-error.tsx` additionally can't use `next/link` (the router it needs lives in the layout that just crashed) and re-derives the light/dark class from `document.documentElement` rather than re-running the root layout's inline theme script, since it *is* what replaces that layout.

### Color strategy

Restrained: single accent ≤10% of any surface. Five rules:

1. **Color is never the sole signal.** Every positive/negative tint pairs with a non-color signal (arrow, ordinal, italic display weight, 1px rule, font-weight bump).
2. **Decorative gradients are banned.** No gradient text (`background-clip: text`), no gradient buttons, no gradient cards, no gradient borders. Named exception: per-manager accent radial on profile pages.
3. **The accent does work.** Amber on kickers, top-N ordinals, the avatar gradient ring, `RankRing`'s arc, focus indication, the masthead year tag: not a decorative wash.
4. **Sparkline tinting is functional.** Trend direction → stroke color. Direction-of-change reads before the value, paired with the visual angle of the line itself.
5. **Avoid category-default palettes.** No team logos, no NFL color codes, no position color codes, no sportsbook neon, no SaaS gradient-on-card. Personality comes from typography and the league's owners' avatars.

### Layout rules

- **Phone is canonical.** Decisions happen on the phone first; desktop adds a column or two of breathing room, never a different IA.
- **Density beats sparsity.** Padded cards are not a substitute for hierarchy. Hairlines + vertical rhythm + type weight do the work.
- **Predictable grids, but not symmetric for symmetry's sake.** A 4-card symmetric grid is the AI-slop default. A 1-2-1 layout (one hero row, two asymmetric blocks below, one full-width) is more confident when content priority isn't equal.
- **Touch targets ≥ 44px** on phone-first views.
- **Container max-width** is `max-w-6xl` on every page that sets one. Don't introduce new max-widths for variety.

### Anti-pattern bans

Do not ship any of these without an explicit, written exception in this document:

- **Side-stripe borders >1px** as decorative accent. (1px as semantic state, via `rowAccent`, is allowed.)
- **Gradient text** (`background-clip: text` over a gradient).
- **Glassmorphism** as default decoration. (Header and floating live-status-pill backdrop-blur are functional, sticky/floating-nav-related, allowed.)
- **The hero-metric template**: big number / small label / supporting stats / gradient accent.
- **Identical card grids**: same-sized cards × icon × heading × text, repeated.
- **Modal as first thought.** Always exhaust inline / progressive disclosure / `<details>` first.
- **Default Tailwind focus rings** (any color-named ring class).
- **Default Next.js 404 or 500**: replaced by the voiced 404 (`/not-found.tsx`) and the voiced error boundaries (§ above).
- **Default Vercel OG / default favicon.**
- **Em dashes used as decoration** in *interface copy* (UX strings, empty states, error messages). Use commas, colons, semicolons, periods, or parentheses instead. (This document follows the same convention throughout.)
- **Team-color chrome / position color codes / Sleeper-style chunky pills.**

### Accessibility

- WCAG AA on contrast in both themes, including the editorial accent.
- Reduced-motion path in `globals.css`: preserve it.
- Color is never the sole signal (see rule 1 above).
- Cmd+K palette is the keyboard spine: every primary navigation target must be reachable from it.
- Touch targets ≥ 44px on phone-first views.

## 8. Conventions

- **TypeScript strict; no `any`.** Three type layers kept separate (Sleeper / FantasyCalc / domain).
- **Path alias** `@/*` → `src/*`.
- **Server-only data layer.** `src/lib/data/*` uses `node:fs`; never import from a client component.
- **Mobile-first.** The phone is the canonical view for product surfaces; desktop adds a column or two, never a different IA.
- **Service worker** (`public/sw.js`) is hand-written, not a library. Bump `VERSION` when the precached shell content changes (or the visual surfaces of those shell paths change) so old precached responses don't pin stale UI.
- **Shared nav source of truth.** `NAV_LINKS` and `isActiveNav` live once in `src/components/nav-active.ts`; `NavLinks`, `MobileNav`, and `BottomTabBar` all read from it rather than each carrying their own copy of the route list.
- **Client/server split for tabbed data.** Where a UI needs client-side tab state over server-computed content (the team overview switcher is the current example), keep the client component to the visibility toggle and pass the rendered cards in as `children`. Don't let rankings/data-layer code cross into a `"use client"` file to satisfy a tab.
- **Barrel-import discipline for error boundaries.** `app/error.tsx` and `app/global-error.tsx` import individual `ui/` components directly (`@/components/ui/Skeleton`, not the `@/components/ui` barrel) because both land in every route segment's client reference manifest; going through the barrel would pull the whole `ui/` client graph into every route's bundle.
- **LF/CRLF.** `git` shows line-ending warnings on first stage of any TSX/CSS file because the working tree uses CRLF on Windows. Harmless: on-disk content is unchanged.

### Unit tests

`npm test` runs Node's built-in test runner (`tsx --test`) over an explicit file list in `package.json`: no Jest, no Vitest, no config file. Coverage is deliberately narrow: pure functions and one fault-injection suite, not component or page tests.

| File | Covers |
|---|---|
| `src/lib/rankings/season-power.test.ts` | `computeAllPlayRecord`, `computeSeasonPower` |
| `src/lib/rankings/team-strength.test.ts` | `buildTeamStrengths`, `ordinal` |
| `src/lib/rankings/week-strength.test.ts` | `buildWeekStrengthSources` |
| `src/lib/rankings/pick-portfolio.test.ts` | `buildPickPortfolios` |
| `src/lib/data/weekly.test.ts` | `getRegularSeasonEndWeek`, `getWeekBounds`, `getWeeklyPointsByRoster` |
| `src/lib/data/matchups-index.test.ts` | `latestCachedMatchupWeek`, `listCachedMatchupWeeks` |
| `src/lib/data/brackets.test.ts` | `getSeasonPlacements`, `readWinnersBracket`/`readLosersBracket` |
| `src/lib/sleeper/client.test.ts` | Sleeper client retry classification |
| `src/lib/fantasycalc/client.test.ts` | FantasyCalc client retry classification, `tepMultiplier` |
| `scripts/ingest.promotion.test.ts` | `promoteAll` / `recoverInterruptedPromotions`, fault-injection: drives the stage → promote swap into specific failures against a throwaway scratch directory and asserts on the bytes left on disk, proving a crash mid-promotion can't leave a season half-written |

**Verification recipe** (CLAUDE.md): `npm run typecheck` + `npm run lint` + `npm test` + a manual phone-viewport pass. No test currently renders a component or page. A UI regression still needs the manual pass.

## 9. Intentional cuts

These were considered and explicitly cut. Don't reintroduce without a deliberate reversal.

| Original / planned | Why cut |
|---|---|
| Blog (`/blog`, `/blog/[slug]`, comments) | Group chat covers it; no auth in v1. |
| Contentful integration | Tied to blog cut. |
| `/rosters` page | Content available via `/standings` and `/managers/[username]`. |
| `/resources` (RSS news feed) | Group chat covers it; would be stale and out of voice. |
| Server-side `/players/nfl` proxy | Replaced with build-time fetch → `data/players.json`. |
| `/api/checkVersion` | Netlify deploy is the version. |
| Query-string trade pagination (`?page=N`) | `force-static` resolves `searchParams` to `{}` at build time, so every `?page=N` silently served page 1. Replaced with path-based `/transactions/trades/page/[page]`, statically enumerated, with a redirect for old links. |
| Material UI / SMUI / shadcn components | Replaced with hand-rolled UI primitives in `src/components/ui/`. |
| Color-bordered stat tiles (pink/yellow/green/orange/blue) | Replaced with `Card variant="row"` and DataTable hairline rules; semantic color via `rowAccent` / Sparkline `tintTrend`, paired with shape. |
| Atmosphere components (`Spotlight`, `DotGrid`) | Decorative chrome with no semantic role. |
| `/managers/[username]/vs/[other]` (planned) | Redundant with `/h2h/[u1]/[u2]`. |
| Auth, comments, posting, push notifications | Out of scope for v1. |
| Multi-tenant / SaaS hosting | Single-tenant per league by design. |
| AI-generated content (recaps, roasts, trade analysis) | If wanted later, generate locally and commit MDX. |
| Real-time WebSocket scoring (matchups and drafts alike) | Sleeper API doesn't support it; interval polling (30s live scoring, seconds-to-minutes live draft) suffices. |
| In-site trade proposals / lineup setting | Sleeper handles these. |

## 10. Success criteria

- All preserved features ship.
- Lighthouse mobile ≥ 95 (Performance, Accessibility, Best Practices).
- LCP < 1s on 4G.
- `npm run typecheck`, `npm run lint`, and `npm test` stay green.
- Total hosting cost: $0/year (excluding optional custom domain).
- Codebase clean enough that next year's redesign isn't a full rewrite.
