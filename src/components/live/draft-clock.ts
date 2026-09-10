import type {
  SleeperDraft,
  SleeperDraftPick,
  SleeperTradedPick,
} from "@/lib/sleeper";
import type { Manager } from "@/lib/types";

/**
 * Who is on the clock, resolved from live Sleeper draft data. Shared by the
 * draft room and the site-wide banner so the two can never disagree about
 * whose pick it is.
 */
export interface DraftClock {
  /** 1-indexed overall pick number about to be made. */
  pickNo: number;
  round: number;
  /** 1-indexed slot within the round (the board column). */
  slot: number;
  /** Manager whose slot this originally was, if resolvable. */
  originalManager: Manager | null;
  /** Manager actually picking, after traded picks. */
  manager: Manager | null;
  /** True when the pick changed hands before the draft. */
  traded: boolean;
}

export function draftTotalPicks(draft: SleeperDraft): number {
  return draft.settings.rounds * draft.settings.teams;
}

/** "2.04"-style board label. */
export function pickLabel(round: number, slot: number): string {
  return `${round}.${String(slot).padStart(2, "0")}`;
}

/**
 * Round and slot for an overall pick number. Rookie drafts are linear, but
 * Sleeper also runs snake drafts, where even rounds reverse the order.
 */
export function slotForPick(
  draft: SleeperDraft,
  pickNo: number,
): { round: number; slot: number } {
  const teams = draft.settings.teams;
  const round = Math.ceil(pickNo / teams);
  const idx = (pickNo - 1) % teams;
  const slot =
    draft.type === "snake" && round % 2 === 0 ? teams - idx : idx + 1;
  return { round, slot };
}

/**
 * Slot → original roster_id. Sleeper publishes `slot_to_roster_id` on the
 * draft detail once the order is locked; before that, `draft_order` (keyed by
 * user_id) is mapped through the managers list.
 */
function slotOwners(
  draft: SleeperDraft,
  managers: Manager[],
): Map<number, number> {
  const bySlot = new Map<number, number>();
  if (draft.slot_to_roster_id) {
    for (const [slot, rosterId] of Object.entries(draft.slot_to_roster_id)) {
      bySlot.set(Number(slot), rosterId);
    }
    if (bySlot.size > 0) return bySlot;
  }
  if (draft.draft_order) {
    const byUserId = new Map(managers.map((m) => [m.userId, m]));
    for (const [userId, slot] of Object.entries(draft.draft_order)) {
      const manager = byUserId.get(userId);
      if (manager) bySlot.set(slot, manager.rosterId);
    }
  }
  return bySlot;
}

/**
 * The pick about to be made: `picks.length + 1`, resolved to the manager who
 * actually holds it. Returns null once every pick is in.
 *
 * `offset` asks for a pick further out (1 = the pick after the clock), which
 * the room uses for its "up next" strip.
 */
export function draftClock(
  draft: SleeperDraft,
  picks: SleeperDraftPick[],
  tradedPicks: SleeperTradedPick[],
  managers: Manager[],
  offset = 0,
): DraftClock | null {
  const pickNo = picks.length + 1 + offset;
  if (pickNo > draftTotalPicks(draft)) return null;
  const { round, slot } = slotForPick(draft, pickNo);
  const bySlot = slotOwners(draft, managers);
  const byRosterId = new Map(managers.map((m) => [m.rosterId, m]));

  const originalRosterId = bySlot.get(slot) ?? null;
  // Only the latest move matters; Sleeper publishes the final ledger.
  let ownerRosterId = originalRosterId;
  if (originalRosterId !== null) {
    for (const tp of tradedPicks) {
      if (
        Number(tp.season) === Number(draft.season) &&
        tp.round === round &&
        tp.roster_id === originalRosterId
      ) {
        ownerRosterId = tp.owner_id;
      }
    }
  }

  const originalManager =
    originalRosterId !== null
      ? (byRosterId.get(originalRosterId) ?? null)
      : null;
  const manager =
    ownerRosterId !== null ? (byRosterId.get(ownerRosterId) ?? null) : null;
  return {
    pickNo,
    round,
    slot,
    originalManager,
    manager,
    traded: ownerRosterId !== originalRosterId,
  };
}

/** Player fields Sleeper embeds on each live pick's metadata. */
export function pickPlayer(pick: SleeperDraftPick): {
  name: string;
  position: string;
  team: string | null;
} {
  const meta = pick.metadata ?? {};
  const first = meta["first_name"] ?? "";
  const last = meta["last_name"] ?? "";
  const name = `${first} ${last}`.trim() || pick.player_id;
  return {
    name,
    position: meta["position"] ?? "UNK",
    team: meta["team"] || null,
  };
}
