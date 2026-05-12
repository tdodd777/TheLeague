import {
  buildPickValueIndex,
  resolvePickValue,
  withDefaultSlot,
  type FantasyCalcEntry,
  type PickIdentity,
  type PickValueIndex,
} from "@/lib/fantasycalc";
import type { SleeperPlayer } from "@/lib/sleeper";

import type { RankingMode, ValueSnapshot, ValuedAsset } from "./types";

export interface ResolvedSnapshot {
  /** sleeperId → entry. */
  byPlayerId: Map<string, FantasyCalcEntry>;
  /** Pick value lookups (slot-specific + round-only fallback). */
  pickIndex: PickValueIndex;
}

export function resolveSnapshot(
  snapshot: ValueSnapshot,
  mode: RankingMode,
): ResolvedSnapshot {
  const list = mode === "dynasty" ? snapshot.dynasty : snapshot.redraft;
  const byPlayerId = new Map<string, FantasyCalcEntry>();
  for (const entry of list) {
    if (entry.player.position === "PICK") continue;
    if (!entry.player.sleeperId) continue;
    byPlayerId.set(entry.player.sleeperId, entry);
  }
  const pickIndex = buildPickValueIndex(list);
  return { byPlayerId, pickIndex };
}

export interface BuildPlayerAssetOptions {
  /** Optional TEP correction multiplier applied to TE values. Defaults to 1.0. */
  tepMultiplier?: number;
}

export function buildPlayerAsset(
  playerId: string,
  resolved: ResolvedSnapshot,
  players: Record<string, SleeperPlayer>,
  options: BuildPlayerAssetOptions = {},
): ValuedAsset {
  const tep = options.tepMultiplier ?? 1;
  const entry = resolved.byPlayerId.get(playerId);
  const sleeperPlayer = players[playerId];

  // DST players use the team abbreviation as the player_id (e.g. "PIT").
  // FantasyCalc keys those entries by the same abbreviation in sleeperId.
  const position =
    entry?.player.position ??
    sleeperPlayer?.position ??
    (playerId.length <= 3 && playerId === playerId.toUpperCase() ? "DEF" : "UNK");

  const rawValue = entry?.value ?? 0;
  const value = position === "TE" ? rawValue * tep : rawValue;

  const name =
    entry?.player.name ??
    (sleeperPlayer?.full_name ??
      (sleeperPlayer?.first_name && sleeperPlayer?.last_name
        ? `${sleeperPlayer.first_name} ${sleeperPlayer.last_name}`
        : playerId));

  const team = entry?.player.maybeTeam ?? sleeperPlayer?.team ?? null;
  const age = entry?.player.maybeAge ?? sleeperPlayer?.age ?? null;

  return {
    assetId: playerId,
    name,
    position,
    team,
    age,
    value,
    trend30Day: entry?.trend30Day ?? 0,
    overallRank: entry?.overallRank ?? null,
    positionRank: entry?.positionRank ?? null,
    missing: !entry,
  };
}

/**
 * Build a pick asset by resolving its value via the FantasyCalc pick index.
 * The caller has already assigned an exact slot (real draft slot for the
 * upcoming year, mid-round default for future years).
 */
export function buildPickAsset(
  identity: PickIdentity,
  resolved: ResolvedSnapshot,
): ValuedAsset {
  const ident = withDefaultSlot(identity);
  const resolution = resolvePickValue(ident, resolved.pickIndex);
  const slotValue = ident.slot ?? 0;
  const assetId = `PICK:${ident.season}-${ident.round}-${slotValue}`;
  if (!resolution) {
    return {
      assetId,
      name: `${ident.season} R${ident.round}.${String(slotValue).padStart(2, "0")}`,
      position: "PICK",
      team: null,
      age: null,
      value: 0,
      trend30Day: 0,
      overallRank: null,
      positionRank: null,
      missing: true,
      pickSeason: ident.season,
      pickRound: ident.round,
      pickSlot: slotValue,
      pickSource: "missing",
    };
  }
  return {
    assetId,
    name: resolution.entry.player.name,
    position: "PICK",
    team: null,
    age: null,
    value: resolution.value,
    trend30Day: resolution.entry.trend30Day,
    overallRank: resolution.entry.overallRank,
    positionRank: resolution.entry.positionRank,
    missing: false,
    pickSeason: ident.season,
    pickRound: ident.round,
    pickSlot: slotValue,
    pickSource: resolution.source,
  };
}
