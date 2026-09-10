# Training Wheels

A step-by-step guide for launching your own league site with **zero coding experience**. If you have never used GitHub, never opened a terminal, and never deployed a website before, this guide is written for you. Every step says exactly what to click and what you should see happen next.

Total time: about 20 minutes, most of which is waiting for automated steps to finish.

By the end, you will have a live website like this example: **https://the-league.netlify.app**

(This guide is text-only for now: no screenshots of the GitHub/Netlify screens yet, just what to click and what you should see.)

---

## Part 1: Get your site live

### Step 1. Create a free GitHub account

GitHub is the website that hosts this project's code (and will host your copy of it). If you already have an account, skip to Step 2.

1. Go to **github.com** in your browser.
2. Click **Sign up** in the top right.
3. Enter your email, create a password, and pick a username.
4. Verify your email when GitHub asks you to.

You now have a free GitHub account.

### Step 2. Make your own copy of this project

This project is set up as a GitHub **template**. A template works like a fork: it gives you your own independent copy of the code that you fully own and can change however you like, without touching the original project or needing the original owner's permission.

1. On this repository's GitHub page, click the green **Use this template** button.
2. Choose **Create a new repository**.

### Step 3. Name and create your repository

1. Give your new repository a name, such as `my-league-site`.
2. Leave the visibility as **Public** (this keeps things simple; Private also works if you'd rather).
3. Click **Create repository from template**.

GitHub will spend a few seconds copying every file into your own account. When it finishes, you will land on the homepage of your very own copy of this project, with a URL like `github.com/your-username/my-league-site`.

### Step 4. Find your Sleeper league ID

Your league ID is a long number Sleeper uses to identify your league. You'll need it in Step 8.

1. Open your league at **sleeper.com** (or in the Sleeper app, then tap the link that opens it in a browser).
2. Look at the address bar. The URL looks like this:

   ```
   https://sleeper.com/leagues/1234567890123456789/league
   ```

3. The long number between `/leagues/` and `/league` is your league ID. Copy it somewhere handy, like a notes app.

### Step 5. Create a free Netlify account

Netlify is the service that will build your site and put it on the internet, for free.

1. Go to **netlify.com**.
2. Click **Sign up**.
3. Choose **Sign up with GitHub**. This is the simplest option because it lets Netlify and GitHub talk to each other directly, which you'll need in the next step.
4. Authorize Netlify when GitHub asks for permission.

### Step 6. Connect your repository to Netlify

1. From your Netlify dashboard, click **Add new site** (sometimes labeled **Add new project**).
2. Choose **Import an existing project** (or **Deploy with GitHub**).
3. If asked, authorize Netlify to see your GitHub repositories.
4. From the list, pick the repository you created in Step 3 (for example, `my-league-site`), not the original template.

Netlify's exact wording shifts a little from time to time as they update their site, but the flow stays the same: connect GitHub, then pick your repository.

### Step 7. Check the build settings

Netlify reads a file in this project called `netlify.toml` and fills in the build settings for you automatically:

- **Build command:** `npm run ingest && npm run build`
- **Publish directory:** `.next`

A **build** is the automated process that turns this project's code, plus your league's live data pulled fresh from Sleeper, into the actual web pages you'll see in your browser. You don't need to understand how it works, just know that it happens on every deploy and takes a couple of minutes.

You shouldn't need to change anything here. Just confirm the fields aren't blank, then continue.

### Step 8. Add your league ID as an environment variable

An **environment variable** is a private setting your site reads while it's being built. It's kept separate from your public code, which matters here because your league ID shouldn't need to be typed into a file everyone on GitHub can see.

1. On the same setup screen (or afterward, under **Site settings → Environment variables**), find the section for environment variables.
2. Click **Add a variable** (or **New variable**).
3. For the key, type exactly: `SLEEPER_LEAGUE_ID`
4. For the value, paste the long number you copied in Step 4.
5. Save it.

### Step 9. Deploy your site

Click **Deploy site** (the exact label may read something like **Deploy my-league-site**).

Netlify will now run the build command from Step 7: it fetches your league's data from Sleeper and FantasyCalc, then assembles your site's pages. You'll see a live log scrolling by. This usually takes a couple of minutes. If your league has many past seasons, the data-fetching part can take a little longer the first time.

### Step 10. Visit your live site

When the log finishes, Netlify shows a green **Published** (or **Site is live**) status and a URL, something like `https://random-words-123456.netlify.app`.

Click that URL. You should see your league's own standings, matchups, and managers, pulled live from Sleeper. That's it: your site is on the internet.

You can change that auto-generated address later to something friendlier, under **Site settings → Domain management**, if you'd like.

---

## Part 2: Customize your site's name and tagline

You don't need to install anything to make these changes. GitHub has a built-in editor right in your browser.

### Step 11. Open the config file on GitHub

1. Go to your repository on GitHub (the copy you made, not the original template).
2. Navigate to `src/config/site.ts` (click through the `src` folder, then `config`).
3. Click the pencil icon (**Edit this file**) in the top right of the file view.

### Step 12. Edit the four lines that matter

You'll see four lines that look like this by default:

```ts
export const LEAGUE_NAME = "Your League";
export const LEAGUE_YEAR = "2026";
export const LEAGUE_TAGLINE =
  "Your dynasty league's rosters, records, and receipts.";
export const LEAGUE_DESCRIPTION =
  "Dynasty fantasy football site for your Sleeper league. Rosters, records, head-to-head, and FantasyCalc-driven dynasty rankings.";
```

Type your own text between the quotation marks for each one:

- `LEAGUE_NAME` shows up in the header, browser tab, and footer of every page.
- `LEAGUE_YEAR` is the current season, shown next to your league name.
- `LEAGUE_TAGLINE` is a short one-line subtitle shown on a few pages.
- `LEAGUE_DESCRIPTION` is a one-sentence summary used for search engines and link previews. Keep it under 160 characters.

Leave the quotation marks, commas, and semicolons exactly where they are, and don't touch the `LEAGUE_YEAR_SHORT` line below them (it updates itself automatically from `LEAGUE_YEAR`).

### Step 13. Commit your change

Scroll to the bottom of the page.

1. You'll see a box for a commit message (a short note describing your change). The default text is fine, or type something like "Update league name."
2. Make sure **Commit directly to the main branch** is selected.
3. Click **Commit changes**.

### Step 14. Watch it redeploy automatically

Netlify is already watching your GitHub repository from Step 6. The moment you commit a change to the main branch, Netlify notices and starts a new build on its own, no extra clicking required.

Head back to your Netlify dashboard and you'll see a new deploy running. Give it a couple of minutes, then refresh your live site. Your new name, year, tagline, and description will be there.

This same pattern (edit a file on GitHub, commit, wait for Netlify) is how every future change gets published. There are a few other files under `src/config/` for further customization (a home-page blurb, manager bios, your league's constitution); `SETUP.md` in this repository covers those in more depth.

---

## Troubleshooting

**The Netlify deploy log shows: `SLEEPER_LEAGUE_ID is not set. Add it to your .env file. See SETUP.md.`**
That message is written for people running this project on their own computer, where settings live in a file called `.env`. You're deploying through Netlify instead, so the fix is: go to **Site settings → Environment variables**, and check that a variable named exactly `SLEEPER_LEAGUE_ID` (all capital letters, underscores, no typos) exists and has a value. Then redeploy: from the **Deploys** tab, use the **Trigger deploy** button and choose **Deploy site**.

**The deploy log shows something like `Sleeper 404 Not Found on /league/...`**
This means the league ID Netlify has doesn't match a real Sleeper league. Go back to Step 4, re-copy the number straight from the address bar on sleeper.com (double-check you copied the whole number, with no extra spaces or characters), and update it under **Site settings → Environment variables**. Redeploy afterward.

**My site is live, but it still says "Your League" everywhere instead of my league's name.**
This means the `src/config/site.ts` edit from Part 2 either wasn't saved, or was committed to a different branch than the one Netlify builds from. Open `src/config/site.ts` on GitHub again and confirm your text is there. Then check **Site settings → Build & deploy → Deploy contexts** on Netlify to confirm the production branch matches the branch you committed to (almost always `main`).

**The deploy log stops partway through with a Sleeper or FantasyCalc error, and no other explanation.**
Both of those services occasionally rate-limit requests for a few seconds. This is usually temporary. Wait a minute, then use **Trigger deploy → Deploy site** again.

**Something else is going wrong, and none of the above matches.**
Copy the exact error text from the Netlify deploy log; it's the fastest way for anyone helping you to know exactly what happened. `SETUP.md` in this repository has a developer-facing walkthrough with more detail if you (or a technical friend) want to dig further.
