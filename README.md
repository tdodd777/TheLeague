# League Page

An open-source Next.js 15 site for a single Sleeper fantasy football league. Dynasty-aware standings, head-to-head, records, FantasyCalc-driven rankings, and a multi-season archive. Spiritual successor to [nmelhado/league-page](https://github.com/nmelhado/league-page) (SvelteKit), same target audience, rebuilt on Next.js with a static + RSC data flow that runs $0/year on Netlify.

```
   League ID  →  ingest  →  /data/*.json  →  Next.js static build  →  Netlify
                                                  ↑
                                                  └─ client polls Sleeper live on game days
```

## Features

- Sunday-mode home (live scoreboard, playoff race, recent moves) auto-switches to editorial off-season mode.
- Dynasty + season + quadrant + trend rankings powered by FantasyCalc, with the rankings engine open and documented in `src/lib/rankings/engine.ts`.
- Head-to-head matrix across every pairing, every season cached.
- All-time records, season recaps, draft boards (past + upcoming with traded picks resolved), trade fairness using value snapshots taken at the time of the trade.
- Cmd+K command palette spanning managers, players, weeks, seasons.
- Per-manager profiles with bio overrides, accent color, career record, current roster.
- Generated OG images per route. PWA-installable with hand-written service worker.

## Quickstart

```bash
git clone <your fork>
cd <your fork>
npm install
echo "SLEEPER_LEAGUE_ID=YOUR_LEAGUE_ID_HERE" > .env
npm run ingest        # required on a fresh checkout. Pulls Sleeper + FantasyCalc into data/
npm run dev
```

`SLEEPER_LEAGUE_ID` is the only required env var. Everything else (number of teams, QB count, PPR, dynasty flag, historical league chain) is auto-derived from the Sleeper API.

→ Full step-by-step walkthrough: **[SETUP.md](./SETUP.md)**
→ Architecture, design system, rankings spec, conventions: **[ARCHITECTURE.md](./ARCHITECTURE.md)**

## Configure your league

Seven files own everything fork-specific:

| File | What it sets |
|---|---|
| `.env` | Your Sleeper league ID. |
| `src/config/site.ts` | League name, year, tagline, meta description. |
| `src/app/globals.css` | Accent color tokens (`--accent-primary` etc.). |
| `src/config/about.ts` | Home-page editorial blurb. |
| `src/config/managers.ts` | Optional per-manager bios (real name, location, philosophy, accent, etc.) keyed by Sleeper user_id. |
| `src/config/constitution.mdx` | League rules, scoring, dues, tiebreakers. |
| `public/managers/` | Optional per-manager avatar PNGs. |

## Commands

| Command | Notes |
|---|---|
| `npm run dev` | Next.js dev server. |
| `npm run build` | Production build. |
| `npm run ingest` | Pulls Sleeper + FantasyCalc into `data/`. Walks the `previous_league_id` chain back to the league's first season. |
| `npm run typecheck` | `tsc --noEmit`. Strict TS with `noUncheckedIndexedAccess`. |
| `npm run lint` / `npm run format` | ESLint + Prettier. |

No test suite. Verification is `typecheck` + `lint` + a phone-viewport pass.

## Deploy

Netlify is the primary target (free tier). The build command in `netlify.toml` runs `npm run ingest && npm run build`, so every build pulls fresh Sleeper + FantasyCalc data. Set `SLEEPER_LEAGUE_ID` in the site's environment variables and you're done. No data files need to live in git.

An optional GitHub Actions cron in `.github/workflows/refresh-data.yml` pings a Netlify build hook every 6 hours, so the site stays current without committing data snapshots. Set `NETLIFY_BUILD_HOOK_URL` in the repo's secrets to enable it.

Vercel works too. Change the install/build settings to run `npm run ingest && npm run build` instead of the default.

## Credits

Spiritual successor to [nmelhado/league-page](https://github.com/nmelhado/league-page). Rankings methodology informed by KTC's published stud-weighting approach and Dynasty Daddy's open-source implementation. Values from [FantasyCalc](https://fantasycalc.com).

## License

MIT — see [LICENSE](./LICENSE).
