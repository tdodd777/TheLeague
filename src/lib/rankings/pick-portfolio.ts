import { DEFAULT_FUTURE_PICK_SLOT, type PickIdentity } from "@/lib/fantasycalc";
import type {
  SleeperDraft,
  SleeperLeague,
  SleeperRoster,
  SleeperTradedPick,
} from "@/lib/sleeper";

/** Initial portfolios: each roster owns its own draft_rounds picks per season. */
function originalPicks(
  rosters: readonly SleeperRoster[],
  league: SleeperLeague,
  seasons: readonly number[],
): Map<number, PickIdentity[]> {
  const out = new Map<number, PickIdentity[]>();
  const rounds = league.settings.draft_rounds;
  for (const r of rosters) {
    const list: PickIdentity[] = [];
    for (const season of seasons) {
      for (let round = 1; round <= rounds; round += 1) {
        list.push({ season, round, slot: null });
      }
    }
    out.set(r.roster_id, list);
  }
  return out;
}

/**
 * For the upcoming-rookie-draft year, slots are deterministic if the draft
 * has draft_order set. Map roster_id → slot using draft.draft_order (which
 * is keyed by user_id) and the rosters' owner_ids.
 */
function buildCurrentYearSlotByRoster(
  draft: SleeperDraft | undefined,
  rosters: readonly SleeperRoster[],
): Map<number, number> {
  const slotByRoster = new Map<number, number>();
  if (!draft) return slotByRoster;
  if (draft.slot_to_roster_id) {
    for (const [slot, rosterId] of Object.entries(draft.slot_to_roster_id)) {
      slotByRoster.set(rosterId, Number(slot));
    }
    return slotByRoster;
  }
  if (draft.draft_order) {
    const userToRoster = new Map<string, number>();
    for (const r of rosters) {
      if (r.owner_id) userToRoster.set(r.owner_id, r.roster_id);
    }
    for (const [userId, slot] of Object.entries(draft.draft_order)) {
      const rosterId = userToRoster.get(userId);
      if (rosterId !== undefined) slotByRoster.set(rosterId, slot);
    }
  }
  return slotByRoster;
}

/**
 * Build per-roster pick portfolios from traded_picks. Returns a map of
 * roster_id → list of {@link PickIdentity}, with slots assigned where
 * possible:
 *
 *   - Upcoming-rookie-draft year (the current league year): real slot from
 *     draft.draft_order if available (it is once the draft is scheduled).
 *   - Future years: slot left as null. The caller passes through
 *     `withDefaultSlot` (slot 7 mid-round default) before resolving.
 */
export function buildPickPortfolios(
  league: SleeperLeague,
  rosters: readonly SleeperRoster[],
  tradedPicks: readonly SleeperTradedPick[],
  drafts: readonly SleeperDraft[],
  options: { seasons?: readonly number[] } = {},
): Map<number, PickIdentity[]> {
  const currentYear = Number(league.season);
  const seasons =
    options.seasons ??
    [currentYear, currentYear + 1, currentYear + 2, currentYear + 3];
  const portfolios = originalPicks(rosters, league, seasons);

  // Apply pick trades. The Sleeper schema:
  //   roster_id          = original owner (which roster the pick "comes from")
  //   previous_owner_id  = the seller in this trade (may equal roster_id, or
  //                        an intermediate holder)
  //   owner_id           = current owner
  // Net effect: the pick (from `roster_id`'s slot) ends up in `owner_id`'s
  // portfolio. Both are tracked: if owner_id == roster_id, no net movement.
  // We track which roster each portfolio item *came from* so we can assign
  // the upcoming-year slot from the right source.
  interface Owned {
    season: number;
    round: number;
    /** Roster whose finish position determines the slot. */
    originalRosterId: number;
  }
  const owned = new Map<number, Owned[]>();
  for (const r of rosters) owned.set(r.roster_id, []);
  for (const r of rosters) {
    for (const season of seasons) {
      for (let round = 1; round <= league.settings.draft_rounds; round += 1) {
        owned.get(r.roster_id)?.push({
          season,
          round,
          originalRosterId: r.roster_id,
        });
      }
    }
  }
  for (const tp of tradedPicks) {
    const season = Number(tp.season);
    if (!seasons.includes(season)) continue;
    if (tp.owner_id === tp.previous_owner_id) continue;
    // Remove the pick from the original roster's holdings (matched by season,
    // round, original roster). Add to the new owner's holdings.
    const fromList = owned.get(tp.roster_id);
    if (fromList) {
      const idx = fromList.findIndex(
        (p) =>
          p.season === season &&
          p.round === tp.round &&
          p.originalRosterId === tp.roster_id,
      );
      if (idx >= 0) fromList.splice(idx, 1);
    }
    // Also remove it from any intermediate holder (previous_owner_id) — the
    // chain may have moved through multiple rosters; by the time we read the
    // final ledger from Sleeper, only the latest move matters. The final
    // owner is `owner_id`. We still need to ensure other intermediate copies
    // aren't double-counted: scan all rosters and remove any matching item
    // that isn't the final destination's holdings.
    for (const [rid, list] of owned) {
      if (rid === tp.owner_id) continue;
      const idx = list.findIndex(
        (p) =>
          p.season === season &&
          p.round === tp.round &&
          p.originalRosterId === tp.roster_id,
      );
      if (idx >= 0) list.splice(idx, 1);
    }
    // Add to the new owner if not already there.
    const toList = owned.get(tp.owner_id);
    if (toList) {
      const exists = toList.some(
        (p) =>
          p.season === season &&
          p.round === tp.round &&
          p.originalRosterId === tp.roster_id,
      );
      if (!exists) {
        toList.push({
          season,
          round: tp.round,
          originalRosterId: tp.roster_id,
        });
      }
    }
  }

  // Convert to PickIdentity, assigning current-year slots from draft_order.
  const currentDraft = drafts.find((d) => Number(d.season) === currentYear);
  const slotByRoster = buildCurrentYearSlotByRoster(currentDraft, rosters);

  for (const [rosterId, items] of owned) {
    const list: PickIdentity[] = items.map((it) => ({
      season: it.season,
      round: it.round,
      slot:
        it.season === currentYear
          ? (slotByRoster.get(it.originalRosterId) ?? null)
          : null,
    }));
    list.sort(
      (a, b) =>
        a.season - b.season ||
        a.round - b.round ||
        (a.slot ?? DEFAULT_FUTURE_PICK_SLOT) -
          (b.slot ?? DEFAULT_FUTURE_PICK_SLOT),
    );
    portfolios.set(rosterId, list);
  }

  return portfolios;
}
