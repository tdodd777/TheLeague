import path from "node:path";
import { readFile } from "node:fs/promises";

import type {
  SleeperDraft,
  SleeperDraftPick,
  SleeperPlayer,
} from "@/lib/sleeper";
import type { Manager } from "@/lib/types";

import {
  listCachedSeasons,
  readDrafts,
  readLeague,
  readPlayers,
  readRosters,
  readTradedPicks,
} from "./cache";
import { getManagers, type ManagerLookup } from "./managers";
import { getStandings } from "./standings";
import { seasonDir } from "./paths";

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

async function readDraftPicks(
  season: string,
  draftId: string,
): Promise<SleeperDraftPick[] | null> {
  return readJsonOrNull<SleeperDraftPick[]>(
    path.join(seasonDir(season), `draft-${draftId}-picks.json`),
  );
}

/**
 * The league's published draft order for a season, keyed by user_id.
 *
 * Sleeper keys `draft_order` by user_id, which is the one identifier that
 * survives a season rollover, so this is the authoritative answer for who owns
 * which slot. `drafts.json` normally carries it; the per-draft detail file is
 * checked as a backstop. Null means Sleeper has not set an order yet.
 */
async function readDraftOrder(
  season: string,
  draft: SleeperDraft,
): Promise<Record<string, number> | null> {
  if (draft.draft_order && Object.keys(draft.draft_order).length > 0) {
    return draft.draft_order;
  }
  const detail = await readJsonOrNull<SleeperDraft>(
    path.join(seasonDir(season), `draft-${draft.draft_id}.json`),
  );
  if (detail?.draft_order && Object.keys(detail.draft_order).length > 0) {
    return detail.draft_order;
  }
  return null;
}

export interface DraftSummary {
  season: string;
  draft: SleeperDraft;
  status: SleeperDraft["status"];
  totalPicks: number;
  rounds: number;
  /** Manager who held #1 overall slot (current owner if traded). */
  firstOverall: { slot: number; player: string | null; manager: Manager | null } | null;
}

export async function getDraftSummaries(): Promise<DraftSummary[]> {
  const seasons = await listCachedSeasons();
  const summaries: DraftSummary[] = [];
  for (const season of seasons) {
    const drafts = await readDrafts(season).catch(() => []);
    if (drafts.length === 0) continue;
    const managers = await getManagers(season);
    for (const draft of drafts) {
      const picks = (await readDraftPicks(season, draft.draft_id)) ?? [];
      const top = picks.find((p) => p.pick_no === 1);
      const players = top ? await readPlayers() : null;
      const player =
        top && players
          ? (players[top.player_id]?.full_name ?? top.player_id)
          : null;
      const manager = top
        ? (managers.byRosterId.get(top.roster_id) ?? null)
        : null;
      summaries.push({
        season,
        draft,
        status: draft.status,
        totalPicks: picks.length,
        rounds: draft.settings.rounds,
        firstOverall: top
          ? {
              slot: top.draft_slot,
              player,
              manager,
            }
          : null,
      });
    }
  }
  return summaries;
}

export interface DraftPickResolved {
  pickNo: number;
  round: number;
  slot: number;
  rosterId: number;
  manager: Manager | null;
  playerId: string;
  playerName: string;
  position: string;
  team: string | null;
  isKeeper: boolean | null;
  /** Current FantasyCalc dynasty value of the player drafted. */
  currentValue: number;
  /**
   * "Slot baseline" — current FantasyCalc value for the same slot in the
   * upcoming-year rookie pick (a proxy for "what an average pick here is
   * worth in today's market"). Null if the snapshot has no value for this
   * slot.
   */
  slotBaseline: number | null;
  /** currentValue − slotBaseline (positive = exceeded slot). */
  delta: number | null;
}

export interface DraftRecap {
  season: string;
  draft: SleeperDraft;
  picks: DraftPickResolved[];
  /** Roster_id → manager (the draft-time owner of each slot). */
  managers: ManagerLookup;
  rounds: number;
  steals: DraftPickResolved[];
  reaches: DraftPickResolved[];
  snapshotDate: string;
}

interface RecapInputs {
  byPlayerId: Map<string, { value: number; trend: number }>;
  /** key "season-round-slot". */
  bySlotKey: Map<string, number>;
  /** key "season-round". */
  byRoundKey: Map<string, number>;
  snapshotDate: string;
}

/**
 * Build the slot baselines from the current snapshot. We use the upcoming-year
 * rookie picks (the one season FantasyCalc publishes slot-specific values
 * for) as the baseline for every historical pick: "current value of slot
 * 1.04" = "what an average #4 overall pick is worth today."
 */
function buildSlotBaselines(
  snapshotDate: string,
  pickEntries: Array<{ name: string; value: number }>,
): { bySlotKey: Map<string, number>; byRoundKey: Map<string, number> } {
  const bySlotKey = new Map<string, number>();
  const byRoundKey = new Map<string, number>();
  // The snapshot publishes "YYYY Pick R.PP" entries; the current-rookie year
  // (e.g. 2026) is the only season with slot-specific values.
  const exact = /^(\d{4})\s+Pick\s+(\d+)\.(\d{2})$/;
  const round = /^(\d{4})\s+(1st|2nd|3rd|4th)$/;
  const ord: Record<string, number> = { "1st": 1, "2nd": 2, "3rd": 3, "4th": 4 };
  let upcomingYear = 0;
  for (const e of pickEntries) {
    const m = exact.exec(e.name);
    if (m) {
      const year = Number(m[1]);
      const r = Number(m[2]);
      const slot = Number(m[3]);
      bySlotKey.set(`${r}-${slot}`, e.value);
      if (year > upcomingYear) upcomingYear = year;
    }
    const r = round.exec(e.name);
    if (r) {
      const year = Number(r[1]);
      const ordStr = r[2]!;
      const round = ord[ordStr];
      if (round) byRoundKey.set(`${year}-${round}`, e.value);
    }
  }
  // Note: snapshot date used only to credit the source.
  void snapshotDate;
  return { bySlotKey, byRoundKey };
}

async function loadInputs(): Promise<RecapInputs> {
  const { getLatestSnapshot } = await import("@/lib/rankings");
  const { date, snapshot } = await getLatestSnapshot();
  const byPlayerId = new Map<string, { value: number; trend: number }>();
  for (const e of snapshot.dynasty) {
    if (e.player.position === "PICK") continue;
    if (!e.player.sleeperId) continue;
    byPlayerId.set(e.player.sleeperId, {
      value: e.value,
      trend: e.trend30Day,
    });
  }
  const pickEntries = snapshot.dynasty
    .filter((e) => e.player.position === "PICK")
    .map((e) => ({ name: e.player.name, value: e.value }));
  const baselines = buildSlotBaselines(date, pickEntries);
  return {
    byPlayerId,
    bySlotKey: baselines.bySlotKey,
    byRoundKey: baselines.byRoundKey,
    snapshotDate: date,
  };
}

export async function getDraftRecap(
  season: string,
): Promise<DraftRecap | null> {
  const drafts = await readDrafts(season).catch(() => []);
  const draft = drafts[0];
  if (!draft) return null;
  const picks = (await readDraftPicks(season, draft.draft_id)) ?? [];
  if (picks.length === 0) {
    return {
      season,
      draft,
      picks: [],
      managers: await getManagers(season),
      rounds: draft.settings.rounds,
      steals: [],
      reaches: [],
      snapshotDate: "",
    };
  }
  const [managers, players, inputs] = await Promise.all([
    getManagers(season),
    readPlayers(),
    loadInputs(),
  ]);

  const resolved: DraftPickResolved[] = picks.map((p) => {
    const meta: SleeperPlayer | undefined = players[p.player_id];
    const playerName =
      meta?.full_name ??
      (meta?.first_name && meta.last_name
        ? `${meta.first_name} ${meta.last_name}`
        : p.player_id);
    const position = meta?.position ?? "UNK";
    const slotBaseline =
      inputs.bySlotKey.get(`${p.round}-${p.draft_slot}`) ??
      inputs.byRoundKey.get(`${Number(season) + 1}-${p.round}`) ??
      null;
    const currentValue = inputs.byPlayerId.get(p.player_id)?.value ?? 0;
    return {
      pickNo: p.pick_no,
      round: p.round,
      slot: p.draft_slot,
      rosterId: p.roster_id,
      manager: managers.byRosterId.get(p.roster_id) ?? null,
      playerId: p.player_id,
      playerName,
      position,
      team: meta?.team ?? null,
      isKeeper: p.is_keeper,
      currentValue,
      slotBaseline,
      delta:
        slotBaseline !== null ? currentValue - slotBaseline : null,
    };
  });
  resolved.sort((a, b) => a.pickNo - b.pickNo);

  const ranked = resolved
    .filter((p) => p.delta !== null && p.currentValue > 0)
    .sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0));
  const steals = ranked.slice(0, 5);
  const reaches = ranked.slice(-5).reverse();

  return {
    season,
    draft,
    picks: resolved,
    managers,
    rounds: draft.settings.rounds,
    steals,
    reaches,
    snapshotDate: inputs.snapshotDate,
  };
}

export interface LiveDraftHandle {
  season: string;
  draftId: string;
  /** Status as of the last ingest — live polling refines it in the browser. */
  cachedStatus: SleeperDraft["status"];
}

/**
 * The newest cached season's draft, when it has not completed as of the last
 * ingest. This is what the live-draft components poll against: the static
 * build can only know that a draft exists and where it lives, never whether
 * it is running right now.
 */
export async function getLiveDraftHandle(): Promise<LiveDraftHandle | null> {
  const seasons = await listCachedSeasons();
  const newest = seasons[0];
  if (!newest) return null;
  const drafts = await readDrafts(newest).catch(() => []);
  const draft = drafts[0];
  if (!draft || draft.status === "complete") return null;
  return {
    season: newest,
    draftId: draft.draft_id,
    cachedStatus: draft.status,
  };
}

export interface UpcomingDraftSlot {
  /** 1-indexed pick slot (1 → first overall in that round). */
  slot: number;
  /** Current owner of this slot, resolved in the upcoming season. */
  manager: Manager | null;
  /**
   * Manager the slot belongs to before any trades, resolved in the upcoming
   * season. Differs from `manager` when the pick has been traded away.
   */
  originalManager: Manager | null;
  /** True if the pick has been traded out of its original owner. */
  traded: boolean;
}

export interface UpcomingDraftRound {
  round: number;
  slots: UpcomingDraftSlot[];
}

/**
 * Where the slot order came from.
 *
 * - `sleeper` the league's own published draft order. Real.
 * - `derived_standings` our guess, made by reversing a past season's standings.
 * - `derived_roster_order` our fallback guess, roster order, when there is no
 *   finished season to work from.
 */
export type UpcomingDraftOrderSource =
  | "sleeper"
  | "derived_standings"
  | "derived_roster_order";

export interface UpcomingDraftPreview {
  season: string;
  /**
   * Season a provisional order was derived from. Null when the league's own
   * published order was used, because then nothing was derived.
   */
  basisSeason: string | null;
  /** Where the slot order came from. */
  orderSource: UpcomingDraftOrderSource;
  /** True when the order is our guess rather than the league's real order. */
  provisional: boolean;
  /** Plain-language note on where the order came from, safe to render as is. */
  orderNote: string;
  rounds: UpcomingDraftRound[];
  /** Number of picks already traded into other hands. */
  totalTradedPicks: number;
}

/**
 * The upcoming draft: who holds which slot, in which round.
 *
 * The order itself comes from the league's published `draft_order` whenever
 * Sleeper has set one. That is the real answer, and it is keyed by user_id,
 * the only identifier that survives a season rollover, so it is mapped through
 * the upcoming season's own rosters.
 *
 * When no order is published we fall back to reversing the most recent
 * finished season's standings. That is a guess, not the league's rule, so the
 * result is marked `provisional` and carries a note saying so. Managers are
 * matched across the two seasons by user_id, never by roster_id: roster
 * numbers get reassigned between seasons, so roster 2 in 2025 and roster 2 in
 * 2026 can be two different people.
 *
 * Ownership is then reassigned from `traded_picks`, which is already scoped to
 * the upcoming season and so joins on roster_id safely.
 */
export async function getUpcomingDraftPreview(): Promise<UpcomingDraftPreview | null> {
  const seasons = await listCachedSeasons();
  if (seasons.length === 0) return null;
  const upcoming = seasons[0]!;
  const league = await readLeague(upcoming);
  const drafts = await readDrafts(upcoming).catch(() => []);
  const draft = drafts[0];
  if (draft?.status === "complete" || league.status === "complete") {
    return null; // already drafted
  }

  const upcomingManagers = await getManagers(upcoming);
  const rounds = league.settings.draft_rounds;

  // The league's own order, keyed by user_id, mapped onto this season's rosters.
  const publishedOrder = draft ? await readDraftOrder(upcoming, draft) : null;
  const published = new Map<number, number>();
  if (publishedOrder) {
    for (const [userId, slot] of Object.entries(publishedOrder)) {
      const manager = upcomingManagers.byUserId.get(userId);
      if (manager) published.set(manager.rosterId, slot);
    }
  }

  let slotByOriginalRoster: Map<number, number>;
  let orderSource: UpcomingDraftOrderSource;
  let basisSeason: string | null = null;
  let orderNote: string;

  if (published.size > 0) {
    slotByOriginalRoster = published;
    orderSource = "sleeper";
    orderNote = `Draft order as published by the league for ${upcoming}.`;
  } else {
    // Most recent season that actually played games.
    for (const s of seasons) {
      if (s === upcoming) continue;
      const standings = await getStandings(s);
      if (standings.some((r) => r.wins + r.losses + r.ties > 0)) {
        basisSeason = s;
        break;
      }
    }
    slotByOriginalRoster = new Map<number, number>();
    if (basisSeason) {
      const basisStandings = await getStandings(basisSeason);
      // Standings come back best record first, so worst finisher last. Rank by
      // user_id so a manager who changed roster number still lines up, and put
      // anyone who was not in the basis season at the back, since they have no
      // finish to reverse.
      const finishByUserId = new Map<string, number>();
      basisStandings.forEach((row, i) => {
        finishByUserId.set(row.manager.userId, i);
      });
      const ordered = [...upcomingManagers.list].sort((a, b) => {
        const af = finishByUserId.get(a.userId);
        const bf = finishByUserId.get(b.userId);
        if (af === undefined && bf === undefined) return a.rosterId - b.rosterId;
        if (af === undefined) return 1;
        if (bf === undefined) return -1;
        return bf - af;
      });
      ordered.forEach((m, i) => {
        slotByOriginalRoster.set(m.rosterId, i + 1);
      });
      orderSource = "derived_standings";
      orderNote = `Provisional order, not the league's published one. The ${upcoming} order has not been set, so this reverses the ${basisSeason} standings as a stand in.`;
    } else {
      // Nothing to derive from. Roster order, purely so the board renders.
      const rosters = await readRosters(upcoming);
      rosters.forEach((r, i) => {
        slotByOriginalRoster.set(r.roster_id, i + 1);
      });
      orderSource = "derived_roster_order";
      orderNote = `Provisional order, not the league's published one. The ${upcoming} order has not been set and there is no finished season to work from, so teams are listed in roster order.`;
    }
  }

  const tradedPicks = await readTradedPicks(upcoming).catch(() => []);
  const targetSeason = Number(upcoming);
  const seasonTraded = tradedPicks.filter((p) => Number(p.season) === targetSeason);
  // ownerByOriginal: round × original_roster_id → current owner roster_id.
  // Only the latest move matters; Sleeper publishes the final ledger.
  const owner = new Map<string, number>();
  for (const tp of seasonTraded) {
    owner.set(`${tp.round}-${tp.roster_id}`, tp.owner_id);
  }

  const out: UpcomingDraftRound[] = [];
  // Build round 1, then round 2, etc. Slots hold the same order in every round
  // (snake-style logic doesn't apply to dynasty rookie drafts, which are
  // linear).
  const slotEntries = [...slotByOriginalRoster.entries()].sort(
    (a, b) => a[1] - b[1],
  );
  for (let round = 1; round <= rounds; round += 1) {
    const slots: UpcomingDraftSlot[] = slotEntries.map(([originalRosterId, slot]) => {
      const originalManager = upcomingManagers.byRosterId.get(originalRosterId) ?? null;
      const currentOwner = owner.get(`${round}-${originalRosterId}`);
      const ownerRosterId = currentOwner ?? originalRosterId;
      const manager = upcomingManagers.byRosterId.get(ownerRosterId) ?? null;
      return {
        slot,
        manager,
        originalManager,
        traded: currentOwner !== undefined,
      };
    });
    out.push({ round, slots });
  }

  return {
    season: upcoming,
    basisSeason,
    orderSource,
    provisional: orderSource !== "sleeper",
    orderNote,
    rounds: out,
    totalTradedPicks: seasonTraded.length,
  };
}
