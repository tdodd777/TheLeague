<div align="center">

<a href="https://the-league.netlify.app"><img src="docs/assets/logo.svg" alt="The League" width="440"></a>

# [The League](https://the-league.netlify.app)

Generate a full multi-season website for your Sleeper fantasy football league in a few steps.

[![License: MIT](https://img.shields.io/github/license/tdodd777/TheLeague)](./LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-15.5.18-black?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![GitHub stars](https://img.shields.io/github/stars/tdodd777/TheLeague?style=social)](https://github.com/tdodd777/TheLeague/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/tdodd777/TheLeague?style=social)](https://github.com/tdodd777/TheLeague/network/members)
[![GitHub issues](https://img.shields.io/github/issues/tdodd777/TheLeague)](https://github.com/tdodd777/TheLeague/issues)

</div>

_If this saves you a weekend, a star costs nothing and [a coffee](https://buymeacoffee.com/tdodd) is always welcome._

![Home page](docs/screenshots/01-home.png)

## Features

**Now**
- Home page that leads with the current standings, playoff race, and recent moves
- Live standings and weekly matchups with scores and box-score receipts
- League-wide command palette (`⌘K`) searching players, managers, and pages

**History**
- Season history archive with final standings and playoff brackets, season by season
- All-time league records
- Head-to-head record browser between any two managers, every season counted
- Draft boards per season, including the upcoming order with traded picks resolved
- Transaction feed of adds, drops, and waivers
- Trade history with fairness values computed from value snapshots at trade time
- Season awards podium

**People and rankings**
- Manager directory and per-manager profiles with career stats and team overview
- FantasyCalc-driven dynasty roster value rankings
- A quadrant view plotting current-season power against dynasty value

**Everywhere**
- League constitution page for rules, scoring, and tiebreakers
- Mobile layout with a bottom tab bar
- PWA-installable, works from any phone home screen

## Screenshots

<table>
<tr>
<td width="50%"><img src="docs/screenshots/02-standings.png" alt="Standings" /><br/><sub>Current season standings table</sub></td>
<td width="50%"><img src="docs/screenshots/03-matchups.png" alt="Matchups" /><br/><sub>Weekly matchups with scores and receipts</sub></td>
</tr>
<tr>
<td width="50%"><img src="docs/screenshots/04-managers.png" alt="Managers" /><br/><sub>Manager directory</sub></td>
<td width="50%"><img src="docs/screenshots/05-manager-profile.png" alt="Manager profile" /><br/><sub>A single manager profile with career stats and team overview</sub></td>
</tr>
<tr>
<td width="50%"><img src="docs/screenshots/06-h2h.png" alt="Head to head" /><br/><sub>Head to head record browser between any two managers</sub></td>
<td width="50%"><img src="docs/screenshots/07-records.png" alt="Records" /><br/><sub>All-time league records</sub></td>
</tr>
<tr>
<td width="50%"><img src="docs/screenshots/08-history.png" alt="History" /><br/><sub>Season history archive with final standings and brackets</sub></td>
<td width="50%"><img src="docs/screenshots/09-drafts.png" alt="Drafts" /><br/><sub>Draft board for a season</sub></td>
</tr>
<tr>
<td width="50%"><img src="docs/screenshots/10-transactions.png" alt="Transactions" /><br/><sub>Transaction feed of adds, drops and waivers</sub></td>
<td width="50%"><img src="docs/screenshots/11-trades.png" alt="Trades" /><br/><sub>Trade history with fairness values</sub></td>
</tr>
<tr>
<td width="50%"><img src="docs/screenshots/12-rankings-dynasty.png" alt="Dynasty rankings" /><br/><sub>FantasyCalc-driven dynasty roster value rankings</sub></td>
<td width="50%"><img src="docs/screenshots/13-rankings-quadrant.png" alt="Quadrant rankings" /><br/><sub>Quadrant view plotting roster strength against performance</sub></td>
</tr>
<tr>
<td width="50%"><img src="docs/screenshots/14-awards.png" alt="Awards" /><br/><sub>Season awards podium</sub></td>
<td width="50%"><img src="docs/screenshots/15-command-palette.png" alt="Command palette" /><br/><sub>Command palette search across players, managers and pages</sub></td>
</tr>
<tr>
<td width="50%"><img src="docs/screenshots/16-mobile.png" alt="Mobile" /><br/><sub>Mobile layout with the bottom tab bar</sub></td>
<td width="50%"></td>
</tr>
</table>

## Live demo

**[the-league.netlify.app](https://the-league.netlify.app)**

## Quick start

1. Fork this repository.
2. Find your Sleeper league ID (it's the long number in your league's URL).
3. Point a host at your fork, set the `SLEEPER_LEAGUE_ID` environment variable, and deploy. Ingest runs at build time, there's nothing else to configure to get a working site.

> **Never written a line of code?** [TRAINING_WHEELS.md](./TRAINING_WHEELS.md) walks through forking, configuring, and deploying step by step, no terminal required.

## Local development

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_FORK.git
cd YOUR_FORK
npm install
echo "SLEEPER_LEAGUE_ID=your_league_id" > .env
npm run ingest   # required on a fresh checkout: pulls Sleeper + FantasyCalc into data/
npm run dev
```

| Command | What it does |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run ingest` | Pulls Sleeper + FantasyCalc data into `data/`, walking the league's full season history |
| `npm run build` | Production build |
| `npm run start` | Serve a production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` / `npm run format` | ESLint / Prettier |
| `npm run test` | Runs the unit test suite (rankings engine, data layer, API clients) with `tsx --test` |

Node 20+ is required.

## Deploying

**Netlify** (default target, free tier). `netlify.toml` is already committed and sets the build command to `npm run ingest && npm run build`, so every deploy pulls fresh data. Import the fork, set `SLEEPER_LEAGUE_ID` in the site's environment variables, deploy.

**Vercel** works too. Override the build command to `npm run ingest && npm run build` in project settings, then set `SLEEPER_LEAGUE_ID`.

Neither host needs a database or any data committed to the repo.

## How the data pipeline works

`npm run ingest` calls the public Sleeper API at build time: it walks the league's `previous_league_id` chain to pull every season the league has played, snapshots users, rosters, drafts, matchups, transactions, and brackets into `data/`, and pulls dynasty and redraft values from FantasyCalc. Nothing is committed to git, every build regenerates it fresh. `.github/workflows/refresh-data.yml` is an optional cron that pings a Netlify build hook on a schedule so the live site stays current between deploys, without anyone triggering a manual rebuild.

## Configuration

One required environment variable:

```bash
SLEEPER_LEAGUE_ID=1234567890123456789
```

Find it in your league's URL on sleeper.com: `https://sleeper.com/leagues/<league_id>/league`.

Everything else, team count, PPR, dynasty vs. redraft, QB count, is auto-detected from the Sleeper API. Site-specific text lives in `src/config/site.ts`:

```ts
export const LEAGUE_NAME = "Your League";
export const LEAGUE_YEAR = "2026";
export const LEAGUE_TAGLINE = "Your dynasty league's rosters, records, and receipts.";
export const LEAGUE_DESCRIPTION = "Dynasty fantasy football site for your Sleeper league...";
```

Import it as `import { LEAGUE_NAME } from "@/config/site"`. `LEAGUE_YEAR_SHORT` is derived automatically from `LEAGUE_YEAR`.

For manager bios, accent colors, and the league constitution, see [SETUP.md](./SETUP.md).

## Credits

Inspired by [nmelhado/league-page](https://github.com/nmelhado/league-page), the SvelteKit project that proved a self-hosted Sleeper league site was worth building. This is an independent Next.js project, not a fork: different stack, different data pipeline, different design system, built from scratch. If you want a Svelte site instead of a Next.js one, that's the original and it's excellent.

## License

MIT, see [LICENSE](./LICENSE).
