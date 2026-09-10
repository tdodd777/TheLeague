const id = process.env["SLEEPER_LEAGUE_ID"];

if (!id) {
  throw new Error(
    "SLEEPER_LEAGUE_ID is not set. Add it to your .env file. See SETUP.md.",
  );
}

export const SLEEPER_LEAGUE_ID: string = id;
