# Setup

This is the developer setup guide: fork, configure, and deploy from the command line. If you've never written code and just want a running site, use [TRAINING_WHEELS.md](./TRAINING_WHEELS.md) instead: it walks through the same steps without a terminal.

A step-by-step guide to running your own league site. Assumes Node 20+, a GitHub account, and a Sleeper league you commission or play in.

The whole flow is about 20 minutes. Steps 1-3 are mandatory, 4-8 are personalization, 9 ingests your data and verifies it, 10 is an optional test pass, 11 deploys.

## 1. Find your Sleeper league ID

Open your league on sleeper.com (or in the app, then tap the "Web" link). The URL looks like:

```
https://sleeper.com/leagues/1234567890123456789/league
```

The long number is your league ID. Copy it.

You can also find it from the API: visit `https://api.sleeper.app/v1/user/<your_username>/leagues/nfl/<season>` to see every league you're in, each with its `league_id`.

## 2. Fork, clone, install

Fork this repository to your GitHub account, then:

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_FORK.git
cd YOUR_FORK
npm install
```

Node 20+ is required (the `package.json` `engines` field documents this). npm only warns on an older version by default, it won't block `npm install`, but the app is written and tested against 20+.

## 3. Set your league ID

Create a `.env` file at the repo root with one line:

```bash
SLEEPER_LEAGUE_ID=1234567890123456789
```

Replace the number with yours. This is the only required env var. `npm run dev` and `npm run build` don't read it directly, the site only ever reads what ingest already wrote to `data/league-cache/`, so skip ingest and you'll hit the "No cached seasons" error instead once you get to step 9.

`npm run ingest` reads this file too. It runs as a plain script rather than through Next.js, so it loads `.env` and `.env.local` itself using the same loader Next.js uses. Nothing needs to be exported into your shell. If the variable is missing entirely, ingest throws a helpful error (see Troubleshooting).

## 4. Site identity: `src/config/site.ts`

Open the file. It exports five values:

```ts
export const LEAGUE_NAME = "Your League";
export const LEAGUE_YEAR = "2026";
export const LEAGUE_TAGLINE = "Your dynasty league's rosters, records, and receipts.";
export const LEAGUE_DESCRIPTION = "Dynasty fantasy football site for your Sleeper league. ...";
export const LEAGUE_YEAR_SHORT = LEAGUE_YEAR.slice(2);
```

- `LEAGUE_NAME` shows up in the masthead, page titles, footer, OG images.
- `LEAGUE_YEAR` is the four-digit current year displayed next to the masthead. `LEAGUE_YEAR_SHORT` (the short '26 form) is derived from it, not something you edit directly.
- `LEAGUE_TAGLINE` is the subtitle on the managers page and other hero sections.
- `LEAGUE_DESCRIPTION` is the meta description for SEO and link previews. Keep it under 160 characters.

Import these from `@/config/site` anywhere you need them; don't hardcode league name strings elsewhere.

## 5. Accent color: `src/app/globals.css`

The accent is amber by default. Generic sports sites are blue and Sleeper is purple-on-black, so amber claims its own ground. To swap it, edit the `--accent-primary`, `--accent-primary-soft`, and `--accent-primary-glow` tokens in `src/app/globals.css`. Both the light block (`:root, .light`) and the dark block (`.dark`) need their own values.

```css
:root,
.light {
  --accent-primary: #855d12;
  --accent-primary-soft: rgba(133, 93, 18, 0.1);
  --accent-primary-glow: rgba(133, 93, 18, 0.18);
}
.dark {
  --accent-primary: #f5b54a;
  --accent-primary-soft: rgba(245, 181, 74, 0.12);
  --accent-primary-glow: rgba(245, 181, 74, 0.25);
}
```

Pick a color that reads in both modes at small sizes (kickers, ordinals, the focus outline). The accent appears on kickers, top-N ordinals, the avatar gradient ring, focus indication, and the masthead year tag, so subtle is fine. Contrast matters here: the repo's own comment above the light-mode tokens names two earlier amber values that got replaced for it; one cleared the plain background but fell short against the `--accent-primary-soft` chip tint, and the other failed even against the plain background. Check your replacement against both before committing to it.

## 6. (Optional) Manager bios: `src/config/managers.ts`

By default `managerOverrides` is an empty map and managers render with just their Sleeper display name and avatar. To attach a bio, find the manager's Sleeper `user_id` (you can pull it from `data/league-cache/<season>/users.json` after step 9, or from `https://api.sleeper.app/v1/league/<league_id>/users`).

Add an entry:

```ts
export const managerOverrides: Record<string, ManagerOverride> = {
  "123456789012345678": {
    realName: "First Last",
    location: "City, ST",
    bio: "Two-time runner-up. Currently engineering the comeback.",
    favoriteTeam: "PHI",
    mode: "Win Now",
    rookieOrVets: "Vets",
    tradingScale: 7,
    philosophy: "Pay the studs, hate the floor.",
    preferredContact: "Discord",
    rivalUserId: "<other_user_id>",
    accentColor: "#b8851a",
  },
};
```

All fields are optional. Anything missing falls back to Sleeper data or hides. The full field list (including `fantasyStart`, `favoritePlayerId`, and `valuePosition`, not shown above) and the exact enum values are in `src/config/managers.ts` (`ManagerMode`, `RookieOrVets`, `ContactMethod`).

## 7. (Optional) Home blurb: `src/config/about.ts`

`LEAGUE_BLURB` is the editorial paragraph under the masthead. Three to five sentences in your league's voice. Plain text, no JSX.

## 8. (Optional) Constitution: `src/config/constitution.mdx`

MDX file with your league rules: scoring, roster, dues, tiebreakers, taxi/IR rules, draft format. Renders at `/constitution` and is also linked from the footer.

## 9. Ingest + run

```bash
npm run ingest
npm run dev
```

`npm run ingest` does several things:

- Walks the `previous_league_id` chain backward from your current league until it hits null/0, so every season your league has played gets cached.
- Snapshots Sleeper users, rosters, drafts, matchups, transactions, brackets, projections per season into `data/league-cache/<year>/`.
- Snapshots FantasyCalc values into `data/values-snapshots/YYYY-MM-DD.json` (auto-detects dynasty vs. redraft, QB count, team count, PPR from your league settings).
- Refreshes `data/players.json` with the latest Sleeper player metadata (about 18 MB; cached for 24 hours, so most runs skip re-fetching it).

First run, which also pulls that full player database, typically takes 30-90 seconds depending on your connection and how many seasons your league has played. After ingest, `npm run dev` boots the site at `http://localhost:3000`.

Along the way, ingest stages everything under `data/.staging/` and parks the previous live copy under `data/.backups/` while it swaps the new data in, so the site never sees a half-written season. Both directories are gitignored scratch space and normally empty out by the time the run finishes. If a run gets killed mid-swap (Ctrl-C, a crashed terminal), the next `npm run ingest` recovers the parked copy from `.backups` automatically before fetching anything new. You shouldn't need to touch either directory by hand.

## 10. Run the tests (optional)

```bash
npm run test
```

Runs the unit suite (the rankings engine, the data layer, the Sleeper and FantasyCalc API clients, and the ingest promotion/recovery logic from step 9) with Node's built-in test runner via `tsx --test`. No network access or cached seasons required.

```bash
npm run test
```

One note: the test that exercises ingest's promotion logic imports `scripts/ingest.ts`, which throws immediately if `SLEEPER_LEAGUE_ID` is missing. Your `.env` from step 3 covers this, so no extra setup is needed. The value doesn't have to be a real league ID for the tests to pass, it just has to be set.

## 11. Deploy

### Netlify

1. Push your fork to GitHub.
2. In Netlify, "Add new site" → "Import from Git" → pick your fork. Netlify reads `netlify.toml`, which sets the build command to `npm run ingest && npm run build` and the publish directory to `.next` (the official `@netlify/plugin-nextjs` plugin handles routing from there).
3. Add environment variable `SLEEPER_LEAGUE_ID` with your league ID.
4. (Optional) Add `SITE_URL=https://your-site.netlify.app` so OG images and the sitemap resolve correctly. Netlify's built-in `URL` env var is the fallback.
5. Deploy. The build runs ingest first, so no data files need to live in your repo.

### Refresh-data cron (optional)

`.github/workflows/refresh-data.yml` pings a Netlify build hook every 6 hours, which triggers Netlify to rebuild. The ingest runs as part of that rebuild. Enable it by:

1. Generating a build hook URL in Netlify (Site settings → Build & deploy → Build hooks).
2. Adding it to your GitHub repo's secrets as `NETLIFY_BUILD_HOOK_URL`.

Without the cron, your site is fresh as of your last manual Netlify rebuild.

### Vercel

Works too. In project settings, change the build command to `npm run ingest && npm run build`. Same env var (`SLEEPER_LEAGUE_ID`). Vercel's own `VERCEL_URL` is picked up automatically as the `SITE_URL` fallback, but that variable is your `*.vercel.app` subdomain, not a custom domain, so set `SITE_URL` explicitly if you're deploying to one.

## Troubleshooting

**"SLEEPER_LEAGUE_ID is not set. Add it to your .env file. See SETUP.md."** You skipped step 3, or you have a `.env` file but haven't exported the variable into your shell for `npm run ingest` or `npm run test` (both are plain scripts, not Next.js commands, so `.env` alone doesn't reach them), see step 3 and step 10.

**"No cached seasons. Run `npm run ingest`."** You haven't run ingest yet, or your league has zero matchup data. Run `npm run ingest` first; it must succeed before `npm run dev` or `npm run build` will work.

**Ingest fails on a season.** The script logs which season and endpoint. The Sleeper and FantasyCalc clients both retry transient failures (429s, 5xx) on their own backoff before giving up, so a failure that reaches you has usually already survived a few retries. Re-run; if a specific season is consistently broken, the season may be the first one in the league (no `previous_league_id`). The walker stops there, which is correct.

**FantasyCalc 429 or 5xx during ingest.** These are retried automatically. If the run still fails after retries, their API is rate-limiting hard; wait a minute and re-run, values don't change across short windows. A 4xx like 404 or 422 is not retried and means something else, usually a league shape FantasyCalc's param detection didn't expect.

**Site shows "Your League" everywhere after deploy.** You forgot to edit `src/config/site.ts` or it didn't push. Check git log on the deployed branch.

**OG images or the sitemap point at localhost.** Set `SITE_URL` in your hosting env vars. Netlify also exposes a built-in `URL` env var and Vercel a `VERCEL_URL` var that the site falls back to before giving up and using `http://localhost:3000`.
