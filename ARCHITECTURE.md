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

- `src/lib/sleeper/league-chain.ts:walkLeagueChain` — chains backward via `previous_league_id` until null/0.
- `src/lib/fantasycalc/client.ts:deriveParamsFromLeague` — derives `{ isDynasty, numQbs, numTeams, ppr }` from the league response.

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

## 3. Data flow

Single-tenant league site, $0 hosting. **Three data lifetimes coexist** — pick the right one and never the wrong one:

1. **Build-time / committed.** `scripts/ingest.ts` and the optional `.github/workflows/refresh-data.yml` cron pull Sleeper + FantasyCalc and commit JSON to `/data/`. RSC pages read these files via `src/lib/data/cache.ts` (no DB, no runtime API calls).
2. **Static render.** Every historical page is pre-rendered. `src/lib/data/*` is **server-only** (uses `node:fs`); never import it from a client component.
3. **Client live polling.** Only on game days. `src/components/live/` polls Sleeper directly from the browser (CORS open). No `/api/*` proxy exists for live data.

**Architecture contract:** if you find yourself writing a runtime API route to fetch data, you're doing it wrong — the answer is almost always "snapshot it in `scripts/ingest.ts` and read the JSON in an RSC."

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
              │ pre-rendered             │
              └──────────────┬───────────┘
                             ▼
                        Client (PWA)
        ┌──────────────────────────────────────┐
        │ On game days during regular season:  │
        │ client polls Sleeper directly every  │
        │ 30s for live scoring                 │
        └──────────────────────────────────────┘
```

### Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15 (App Router, RSC) | Streaming UI, server components keep player data off the client bundle. |
| Language | TypeScript strict (no `any`) | Sleeper responses are well-shaped; types prevent string-vs-number bugs. |
| Styling | Tailwind v4 + hand-rolled UI primitives | Tokens in `globals.css` `@theme inline`. Components in `src/components/ui/` are bespoke (no shadcn). |
| Animation | Native View Transitions API + tokenized CSS transitions | No Framer / Motion library. Total page motion budget ≤250ms. |
| Charts | Bespoke SVG primitives (Sparkline, ScatterPlot, StackedBar) | No Recharts. Trend-tinted strokes baked into Sparkline. |
| Hosting | Netlify (or Vercel) | Free tier, build hooks. |
| Build cron | GitHub Actions | Free, scheduled rebuilds via Netlify build hook. |
| Storage | Git (`/data/` snapshots) | Player metadata + value snapshots; no DB. |

## 4. Project structure

```
data/
  players.json                  ~5 MB Sleeper player metadata (gitignored, regen via ingest)
  values-snapshots/<date>.json  FantasyCalc dynasty + redraft values (gitignored, regen via ingest)
  league-cache/<season>/        league.json, users, rosters, traded_picks,
                                drafts, matchups-NN.json, transactions-NN.json,
                                projections-NN.json (slim: pts_ppr only),
                                winners_bracket.json, losers_bracket.json
                                (gitignored, regen via ingest)
src/
  app/                          App Router routes
  components/
    command/                    Cmd+K palette
    live/                       Game-day client polling
    ui/                         Card, DataTable, StatTile, Pill, Sparkline, Skeleton, Pagination, ...
    NavLinks.tsx                Desktop nav (active highlight)
    MobileNav.tsx               Mobile nav (active highlight)
    nav-active.ts               isActiveNav(href, pathname) — first-segment match
  config/                       Per-league overrides (see §2)
  lib/
    data/                       Flat re-export API (server-only). Use this, don't re-read JSON ad hoc.
    sleeper/                    Sleeper client + types + league-chain walker
    fantasycalc/                FantasyCalc client (deriveParamsFromLeague, tepMultiplier, pick-resolver)
    rankings/                   engine.ts, lineup-optimizer.ts, pick-name.ts (see §6)
    landing/                    insights.ts (Sunday-mode strip data)
    search/                     command-index.ts
    types.ts                    Domain types (post-transformation)
public/
  sw.js                         Hand-written service worker (versioned cache; bump VERSION on shell change)
  managers/                     Manager photos
scripts/
  ingest.ts                     Build-time data pull
```

`src/lib/data/` is the canonical reader (`getCurrentLeague`, `getManagers`, `getStandings`, `readMatchups`, etc.). New consumers pull from there.

### Type system

Three layers, kept separate:

- `src/lib/sleeper/types.ts` — Sleeper response shapes.
- `src/lib/fantasycalc/types.ts` — FantasyCalc response shapes.
- `src/lib/types.ts` — domain types (`Manager`, `Roster`, `Matchup`, `Transaction`, `RankedManager`).

Path alias: `@/*` → `src/*`.

## 5. Routes

```
/                                  Home — Sunday-mode in-season, editorial off-season (auto-switch)
/standings                         Standings — display-italic ordinals + 1px playoff/demotion rules
/matchups                          Redirects to latest cached week
/matchups/[season]/[week]          Matchup detail
/managers                          Manager directory (hairline-row list)
/managers/[username]               Manager profile (bio, career, roster value, current roster)
/transactions                      All transactions, filterable
/transactions/trades               Trades only
/transactions/trades/[id]          Trade detail with historical fairness
/drafts                            Redirects to /drafts/{latest completed year}
/drafts/[year]                     Canonical drafts surface — year pills nav between years; upcoming preview only on latest year; league-archive metrics merged in
/records                           All-time records
/history                           Season-by-season history index
/history/[year]                    Specific season recap
/awards                            Champion gallery + accolades
/h2h                               H2H heatmap (N×N matrix; display-italic headers)
/h2h/[u1]/[u2]                     Specific rivalry page
/rankings/season                   Season power rankings
/rankings/dynasty                  Dynasty power rankings (top-3 accent ordinals; tap-to-reveal stud breakdown)
/rankings/quadrant                 Contender quadrant chart
/rankings/trend                    30-day trend per team
/constitution                      League constitution (MDX)
/not-found                         Voiced 404 (custom — never let regress to Next.js default)

/sitemap.xml, /robots.txt          SEO metadata
/opengraph-image, /icon, /apple-icon  Generated brand images
```

No `/api/*` runtime routes for data fetching. Live polling on game days hits Sleeper directly from the client.

### Non-obvious route behavior

- **`/`** auto-switches between Sunday-mode (in-season) and editorial mode (off-season). Sunday-mode promotes the `playoffRace` and `dynastyMover` insights from `src/lib/landing/insights.ts` into a first-class type-only `SundayStrip` rendered between the live scoreboard and recent moves; the Pulse drops to 3 cards and the Lede moves below the fold. Off-season keeps the original Lede-leads order.
- **`/drafts`** redirects (server-side via `next/navigation`) to `/drafts/{latest}`. The year page is the canonical drafts surface.
- **Live game-day mode** auto-detects from `state/nfl.season_type === "regular"` plus an unfinished current-week matchup (day-agnostic: Sunday, TNF, MNF all trigger it).
- **Cmd+K palette** (`src/components/command/`) indexes managers, players, weeks, seasons via `src/lib/search/command-index.ts`.
- **Nav active state** matches by **first path segment** so `/rankings/season` highlights "Rankings" (whose href is `/rankings/dynasty`). Both `NavLinks.tsx` and `MobileNav.tsx` share `isActiveNav` from `nav-active.ts`.

### Sleeper API endpoints used

All read-only, no auth. Base `https://api.sleeper.app/v1`:

`/league/{id}`, `/league/{id}/users`, `/league/{id}/rosters`, `/league/{id}/matchups/{week}`, `/league/{id}/winners_bracket`, `/league/{id}/losers_bracket`, `/league/{id}/transactions/{round}`, `/league/{id}/traded_picks`, `/league/{id}/drafts`, `/draft/{id}`, `/draft/{id}/picks`, `/draft/{id}/traded_picks`, `/state/nfl`, `/players/nfl`, `/players/nfl/trending/add|drop`, `/projections/nfl/{year}/{week}`.

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

- `"YYYY Pick R.PP"` — exact slot, used for the upcoming rookie-draft year (e.g. `"2026 Pick 1.04"`). All slots present once draft order is determinable.
- `"YYYY Nth"` — round-only, used for years 2-4 (e.g. `"2027 1st"`).

No Early/Mid/Late tiering exists in the API. Pick lookups are always exact-slot — the parser in `src/lib/rankings/pick-name.ts` is the source of truth. `DEFAULT_FUTURE_PICK_SLOT = 7` is the round-only fallback for years past the next draft.

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

Pre-season (week 0), the last three components are zero — pure value-based. All-play delta vs. actual record is itself a feature ("you got robbed by the schedule").

### Contender quadrant

X = season power, Y = dynasty power. Splits on **league median** (not mean — one elite team would warp a mean split).

- Top-right: **Contenders** (great now AND later)
- Top-left: **Rebuilders** (bad now, stockpiled)
- Bottom-right: **Win-Now** (great now, old, window closing)
- Bottom-left: **Stuck** (the danger zone)

Bubble size = avg starter age (smaller = younger). Bubble color = 30-day trend.

### Edge cases

| Issue | Handling |
|---|---|
| DST | Sleeper uses team abbrev as ID (`"PHI"`); FantasyCalc has these — direct match. |
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
6. 30-day trends are noisy off-season — suppress display April through July.

### Refresh cadence

| Window | Cadence | Why |
|---|---|---|
| In-season (Sept-Jan) | Every 6 hours | Trade values move daily; rosters change post-trade. |
| Off-season pre-rookie-draft (Apr-Jul) | Daily | Rookie pick values move fast. |
| Off-season quiet (Feb-Mar, Aug) | Every 2-3 days | Minimal change. |

Two FantasyCalc API calls per build (one dynasty, one season). Sleeper roster data refreshes on the same cadence.

### Historical value snapshots (trade fairness)

Trade fairness uses values **at the time of the trade**, not current. Every build snapshots FantasyCalc to `data/values-snapshots/YYYY-MM-DD.json`. Trade detail pages find the snapshot closest to the trade's `status_updated` timestamp. After ~5 years this directory is ~10 MB. Trivial.

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
| `--accent-primary` | `#b8851a` | `#f5b54a` |
| `--accent-primary-soft` | `rgba(184,133,26,0.10)` | `rgba(245,181,74,0.12)` |
| `--accent-primary-glow` | existing | existing |
| `--accent-secondary` | `#1d7878` | `#3aa9a9` (avatar gradient ring only) |

Amber is the deliberate accent default. Generic sports sites are blue, Sleeper is purple-on-black. Amber appears only on: kickers, top-N ordinals, the avatar gradient ring, focus indication, the masthead year tag. Not a decorative wash. Forks should swap the accent in `src/config/theme.ts` to claim their own.

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
| Display | Instrument Serif | italic 400 — kickers, ordinals, manager names, h2+ |
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
| h2 | 36px | display-italic — Lede headline, Pulse trend titles |
| h1 (mobile) | 56px | page hero (display-italic) |
| hero (desktop) | 96px | page hero `lg:` |
| masthead | 7rem | home wordmark only |

**Numerals.** `tabular-nums` is the rule, not the exception. Every score, record, percent, PF/PA, sparkline tooltip, tier breakdown uses tabular figures. Body already enables `tnum`; component overrides reach for `.tabular`, never default lining.

**Line length.** Prose 65-75ch (Lede block, off-season blurb). Data tables and compact UI: unconstrained.

### Component vocabulary

**Card** (three roles):

| Variant | Use |
|---|---|
| `default` | Genuine secondary blocks (Pulse trend cards, expandable details). `rounded-xl border bg-surface p-5`. |
| `interactive` | Clickable card-as-link. Kept rare. |
| `row` | Hairline rule between siblings, no rounded shell, no background. Optional `rowAccent` prop draws a 1px semantic left rule. |

The `elevated` variant was deleted as dead code. **Don't reintroduce.**

**DataTable**

- No outer card wrapper. Top + bottom hairlines via `--rule`.
- Headers: `text-[11px] font-semibold uppercase tracking-[0.06em]`. Single hairline beneath header row. **No vertical column rules ever.**
- Hover: `--row-hover` token (no inline class).
- `rowAccent?: (row) => "positive" | "negative" | null` prop renders 1px left-rule using `--row-accent-{positive,negative}`. **1px only** — the ban is on side-stripes >1px as decorative accent. 1px as semantic state is allowed.
- **Phone-first contract:** card-stack pattern (e.g. `StandingsMobileCard`) is the canonical view at `lg:` breakpoint and below. DataTable is desktop-only. Don't make the mobile card a `sm:hidden` fallback.

**Atmosphere is removed.** `src/components/atmosphere/` was deleted in the redesign. Don't reintroduce `Spotlight`, `DotGrid`, or any equivalent decorative wrapper. Visual weight on hero sections comes from vertical whitespace, the `editorial-rule` ornament (`❦`), and display-italic page titles. The one preserved gradient is the per-manager accent radial on `/managers/[username]/page.tsx` — an inline-styled `<div>`, not a component. It's identity, not atmosphere.

**StatTile** — `animate` defaults to `false`. Count-up animation is opt-in per instance, reserved for hero metrics (expectation: zero or one per page).

**Sparkline** — `tintTrend` prop overrides `stroke` with `--trend-{positive,negative}-soft` based on net direction. Prop-driven stroke override stays available for special cases (Lede champion sparkline).

**Skeleton** — hairline-rule pulse, **not** the default Tailwind shimmer rectangle. Default-Tailwind shimmers are an AI-slop tell.

**Pill** — tones: neutral, positive, negative, accent, secondary, warning. Always ring-1 inset, not filled. Reserved for compact state badges (record `9-3`, finish `1st`, mode tags). **Not** for ordinals, section headers, or content emphasis — display-italic + accent color handles those.

**EmptyState** — copy teaches, never apologizes. Each empty state names the league context. Default messages like "No data available" or "Nothing here yet" are forbidden.

**Focus rings** — no default Tailwind ring (no color-named ring class). Use either a 1px accent-colored hairline outline + 2px offset, or `--accent-primary-soft` background fill. Components must not lose visible focus state in either theme.

### Color strategy

Restrained — single accent ≤10% of any surface. Five rules:

1. **Color is never the sole signal.** Every positive/negative tint pairs with a non-color signal (arrow, ordinal, italic display weight, 1px rule, font-weight bump).
2. **Decorative gradients are banned.** No gradient text (`background-clip: text`), no gradient buttons, no gradient cards, no gradient borders. Named exception: per-manager accent radial on profile pages.
3. **The accent does work.** Amber on kickers, top-N ordinals, the avatar gradient ring, focus indication, the masthead year tag — not a decorative wash.
4. **Sparkline tinting is functional.** Trend direction → stroke color. Direction-of-change reads before the value, paired with the visual angle of the line itself.
5. **Avoid category-default palettes.** No team logos, no NFL color codes, no position color codes, no sportsbook neon, no SaaS gradient-on-card. Personality comes from typography and the league's owners' avatars.

### Layout rules

- **Phone is canonical.** Decisions happen on the phone first; desktop adds a column or two of breathing room, never a different IA.
- **Density beats sparsity.** Padded cards are not a substitute for hierarchy. Hairlines + vertical rhythm + type weight do the work.
- **Predictable grids — but not symmetric for symmetry's sake.** A 4-card symmetric grid is the AI-slop default. A 1-2-1 layout (one hero row, two asymmetric blocks below, one full-width) is more confident when content priority isn't equal.
- **Touch targets ≥ 44px** on phone-first views.
- **Container max-width** is `max-w-6xl` on every page that sets one. Don't introduce new max-widths for variety.

### Anti-pattern bans

Do not ship any of these without an explicit, written exception in this document:

- **Side-stripe borders >1px** as decorative accent. (1px as semantic state — `rowAccent` — is allowed.)
- **Gradient text** (`background-clip: text` over a gradient).
- **Glassmorphism** as default decoration. (Header backdrop-blur is functional, sticky-nav-related, allowed.)
- **The hero-metric template** — big number / small label / supporting stats / gradient accent.
- **Identical card grids** — same-sized cards × icon × heading × text, repeated.
- **Modal as first thought.** Always exhaust inline / progressive disclosure / `<details>` first.
- **Default Tailwind focus rings** (any color-named ring class).
- **Default Next.js 404** — replaced by the voiced 404 at `/not-found.tsx`.
- **Default Vercel OG / default favicon.**
- **Em dashes used as decoration** — in *interface copy* (UX strings, empty states, error messages). Use commas, colons, semicolons, periods, parentheses. (Em dashes in narrative prose like this document are fine.)
- **Team-color chrome / position color codes / Sleeper-style chunky pills.**

### Accessibility

- WCAG AA on contrast in both themes, including the editorial accent.
- Reduced-motion path in `globals.css` — preserve it.
- Color is never the sole signal (see rule 1 above).
- Cmd+K palette is the keyboard spine — every primary navigation target must be reachable from it.
- Touch targets ≥ 44px on phone-first views.

## 8. Conventions

- **TypeScript strict; no `any`.** Three type layers kept separate (Sleeper / FantasyCalc / domain).
- **Path alias** `@/*` → `src/*`.
- **Server-only data layer.** `src/lib/data/*` uses `node:fs`; never import from a client component.
- **Mobile-first.** The phone is the canonical view for product surfaces; desktop adds a column or two, never a different IA.
- **Service worker** (`public/sw.js`) is hand-written, not a library. Bump `VERSION` when the precached shell content changes (or the visual surfaces of those shell paths change) so old precached responses don't pin stale UI.
- **LF/CRLF.** `git` shows line-ending warnings on first stage of any TSX/CSS file because the working tree uses CRLF on Windows. Harmless — on-disk content is unchanged.

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
| Material UI / SMUI / shadcn components | Replaced with hand-rolled UI primitives in `src/components/ui/`. |
| Color-bordered stat tiles (pink/yellow/green/orange/blue) | Replaced with `Card variant="row"` and DataTable hairline rules; semantic color via `rowAccent` / Sparkline `tintTrend`, paired with shape. |
| Atmosphere components (`Spotlight`, `DotGrid`) | Decorative chrome with no semantic role. |
| `/managers/[username]/vs/[other]` (planned) | Redundant with `/h2h/[u1]/[u2]`. |
| Auth, comments, posting, push notifications | Out of scope for v1. |
| Multi-tenant / SaaS hosting | Single-tenant per league by design. |
| AI-generated content (recaps, roasts, trade analysis) | If wanted later, generate locally and commit MDX. |
| Real-time WebSocket scoring | Sleeper API doesn't support; 30s polling suffices. |
| In-site trade proposals / lineup setting | Sleeper handles these. |

## 10. Success criteria

- All preserved features ship.
- Lighthouse mobile ≥ 95 (Performance, Accessibility, Best Practices).
- LCP < 1s on 4G.
- Total hosting cost: $0/year (excluding optional custom domain).
- Codebase clean enough that next year's redesign isn't a full rewrite.
