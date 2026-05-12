# Setup

A step-by-step guide to running your own league site. Assumes Node 20+, a GitHub account, and a Sleeper league you commission or play in.

The whole flow is about 20 minutes. Steps 1–3 are mandatory, 4–9 are personalization, 10 verifies, 11 deploys.

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

Node 20+ is required (the `engines` field enforces this).

## 3. Set your league ID

Create a `.env` file at the repo root with one line:

```bash
SLEEPER_LEAGUE_ID=1234567890123456789
```

Replace the number with yours. This is the only required env var. The build will throw a helpful error if it's missing.

## 4. Site identity: `src/config/site.ts`

Open the file. It exports four strings:

```ts
export const LEAGUE_NAME = "Your League";
export const LEAGUE_YEAR = "2026";
export const LEAGUE_TAGLINE = "Your dynasty league's rosters, records, and receipts.";
export const LEAGUE_DESCRIPTION = "Dynasty fantasy football site for your Sleeper league. ...";
```

- `LEAGUE_NAME` shows up in the masthead, page titles, footer, OG images.
- `LEAGUE_YEAR` is the four-digit current year displayed next to the masthead. The short '26 form is derived from it.
- `LEAGUE_TAGLINE` is the subtitle on the managers page and other hero sections.
- `LEAGUE_DESCRIPTION` is the meta description for SEO and link previews. Keep it under 160 characters.

## 5. Accent color: `src/app/globals.css`

The accent is amber by default. Generic sports sites are blue and Sleeper is purple-on-black, so amber claims its own ground. To swap it, edit the `--accent-primary`, `--accent-primary-soft`, and `--accent-primary-glow` tokens in `src/app/globals.css`. Both `:root` (light mode) and `.dark` (dark mode) declarations need their own values.

```css
:root {
  --accent-primary: #b8851a;
  --accent-primary-soft: rgba(184, 133, 26, 0.10);
  --accent-primary-glow: rgba(184, 133, 26, 0.18);
}
.dark {
  --accent-primary: #f5b54a;
  --accent-primary-soft: rgba(245, 181, 74, 0.12);
  --accent-primary-glow: rgba(245, 181, 74, 0.25);
}
```

Pick a color that reads in both modes at small sizes (kickers, ordinals). The accent appears on kickers, top-N ordinals, the avatar gradient ring, focus indication, and the masthead year tag, so subtle is fine.

## 6. (Optional) Manager bios: `src/config/managers.ts`

By default `managerOverrides` is an empty map and managers render with just their Sleeper display name and avatar. To attach a bio, find the manager's Sleeper `user_id` (you can pull it from `data/league-cache/<season>/users.json` after step 10, or from `https://api.sleeper.app/v1/league/<league_id>/users`).

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

All fields are optional. Anything missing falls back to Sleeper data or hides. The exact enum values are in `src/config/managers.ts` (`ManagerMode`, `RookieOrVets`, `ContactMethod`).

## 7. (Optional) Manager photos: `public/managers/`

Drop PNGs in `public/managers/`, named by Sleeper username (e.g. `sleepy_owner_42.png`). If a username isn't a valid filename in your league, use a slug and reference it from the manager override. Square images, 256×256 or larger.

## 8. (Optional) Home blurb: `src/config/about.ts`

`LEAGUE_BLURB` is the editorial paragraph under the masthead. Three to five sentences in your league's voice. Plain text, no JSX.

## 9. (Optional) Constitution: `src/config/constitution.mdx`

MDX file with your league rules: scoring, roster, dues, tiebreakers, taxi/IR rules, draft format. Renders at `/constitution` and is also linked from the footer.

## 10. Ingest + run

```bash
npm run ingest
npm run dev
```

`npm run ingest` does several things:

- Walks the `previous_league_id` chain backward from your current league until it hits null/0, so every season your league has played gets cached.
- Snapshots Sleeper users, rosters, drafts, matchups, transactions, brackets, projections per season into `data/league-cache/<year>/`.
- Snapshots FantasyCalc values into `data/values-snapshots/YYYY-MM-DD.json` (auto-detects dynasty vs. redraft, QB count, team count, PPR from your league settings).
- Refreshes `data/players.json` with the latest Sleeper player metadata.

First run takes 30–90 seconds depending on how many seasons your league has played. After ingest, `npm run dev` boots the site at `http://localhost:3000`.

## 11. Deploy

### Netlify

1. Push your fork to GitHub.
2. In Netlify, "Add new site" → "Import from Git" → pick your fork. Netlify reads `netlify.toml`, which sets the build command to `npm run ingest && npm run build`. Publish directory is handled by the Next plugin.
3. Add environment variable `SLEEPER_LEAGUE_ID` with your league ID.
4. (Optional) Add `SITE_URL=https://your-site.netlify.app` so OG images resolve correctly. Netlify's built-in `URL` env var is the fallback.
5. Deploy. The build runs ingest first, so no data files need to live in your repo.

### Refresh-data cron (optional)

`.github/workflows/refresh-data.yml` pings a Netlify build hook every 6 hours, which triggers Netlify to rebuild. The ingest runs as part of that rebuild. Enable it by:

1. Generating a build hook URL in Netlify (Site settings → Build & deploy → Build hooks).
2. Adding it to your GitHub repo's secrets as `NETLIFY_BUILD_HOOK_URL`.

Without the cron, your site is fresh as of your last manual Netlify rebuild.

### Vercel

Works too. In project settings, change the build command to `npm run ingest && npm run build`. Same env var (`SLEEPER_LEAGUE_ID`).

## Troubleshooting

**`SLEEPER_LEAGUE_ID is not set`**. Add it to `.env` (local) or your hosting env vars (deploy). The error names `SETUP.md` so the message is self-pointing.

**`No cached seasons. Run npm run ingest.`** You haven't run ingest yet, or your league has zero matchup data. Run `npm run ingest` first; it must succeed before `npm run dev` or `npm run build` will work.

**Ingest fails on a season.** The script logs which season and endpoint. Usually a Sleeper API hiccup; re-run. If a specific season is consistently broken, the season may be the first one in the league (no `previous_league_id`). The walker stops there, which is correct.

**FantasyCalc 4xx during ingest.** Their API rate limits hard. Wait a minute and re-run. Values are unchanged across short windows.

**Site shows "Your League" everywhere after deploy.** You forgot to edit `src/config/site.ts` or it didn't push. Check git log on the deployed branch.

**OG images point at localhost.** Set `SITE_URL` in your hosting env vars. Netlify also exposes a built-in `URL` env var the layout falls back to.
