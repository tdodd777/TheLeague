import { readFile } from "node:fs/promises";
import path from "node:path";

import type { SleeperDraftPick, SleeperPlayer } from "@/lib/sleeper";

import { readDrafts, readPlayers, readRosters } from "./cache";
import { seasonDir } from "./paths";

export interface DraftedPickResolution {
  playerId: string;
  playerName: string;
  position: string;
  pickNo: number;
  draftSlot: number;
  round: number;
}

async function readJsonOrNull<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (err) {
    if (
      err instanceof Error &&
      "code" in err &&
      (err as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return null;
    }
    throw err;
  }
}

const cache = new Map<string, Map<string, DraftedPickResolution>>();

/**
 * For a season's completed rookie draft, return a map keyed by
 * `${round}.${originalRosterId}` → the player drafted at that slot.
 *
 * The "original roster" is the team whose initial draft order assigned them
 * the slot in that round — recovered by inverting `draft.draft_order` (user_id
 * → slot) via the season's rosters (user_id → roster_id).
 *
 * Empty map if the draft is unfinished or absent — callers should fall back to
 * the FantasyCalc snapshot lookup for future picks.
 */
export async function resolveDraftedPicks(
  season: string,
): Promise<Map<string, DraftedPickResolution>> {
  const cached = cache.get(season);
  if (cached) return cached;

  const out = new Map<string, DraftedPickResolution>();

  const drafts = await readDrafts(season).catch(() => []);
  const draft = drafts[0];
  if (!draft || draft.status !== "complete" || !draft.draft_order) {
    cache.set(season, out);
    return out;
  }

  const picks = await readJsonOrNull<SleeperDraftPick[]>(
    path.join(seasonDir(season), `draft-${draft.draft_id}-picks.json`),
  );
  if (!picks || picks.length === 0) {
    cache.set(season, out);
    return out;
  }

  const rosters = await readRosters(season);
  const userToRoster = new Map<string, number>();
  for (const r of rosters) {
    if (r.owner_id) userToRoster.set(r.owner_id, r.roster_id);
  }

  // originalRosterId → slot (1..teams) for this season's rookie draft.
  const originalRosterToSlot = new Map<number, number>();
  for (const [userId, slot] of Object.entries(draft.draft_order)) {
    const rid = userToRoster.get(userId);
    if (rid !== undefined) originalRosterToSlot.set(rid, slot);
  }

  // (round, draft_slot) → pick.
  const pickBySlot = new Map<string, SleeperDraftPick>();
  for (const p of picks) pickBySlot.set(`${p.round}.${p.draft_slot}`, p);

  const players = await readPlayers();

  for (const [originalRosterId, slot] of originalRosterToSlot.entries()) {
    for (let round = 1; round <= draft.settings.rounds; round += 1) {
      const pick = pickBySlot.get(`${round}.${slot}`);
      if (!pick) continue;
      const meta: SleeperPlayer | undefined = players[pick.player_id];
      const playerName =
        meta?.full_name ??
        (meta?.first_name && meta.last_name
          ? `${meta.first_name} ${meta.last_name}`
          : pick.player_id);
      out.set(`${round}.${originalRosterId}`, {
        playerId: pick.player_id,
        playerName,
        position: meta?.position ?? "UNK",
        pickNo: pick.pick_no,
        draftSlot: pick.draft_slot,
        round: pick.round,
      });
    }
  }

  cache.set(season, out);
  return out;
}
