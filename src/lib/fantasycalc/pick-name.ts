import type { PickIdentity } from "./types";

const ORDINAL_TO_ROUND: Record<string, number> = {
  "1st": 1,
  "2nd": 2,
  "3rd": 3,
  "4th": 4,
};

const ROUND_TO_ORDINAL: Record<number, string> = {
  1: "1st",
  2: "2nd",
  3: "3rd",
  4: "4th",
};

const EXACT_SLOT_RE = /^(\d{4})\s+Pick\s+(\d+)\.(\d{2})$/;
const ROUND_ONLY_RE = /^(\d{4})\s+(1st|2nd|3rd|4th)$/;

export function parsePickName(name: string): PickIdentity | null {
  const exact = EXACT_SLOT_RE.exec(name);
  if (exact) {
    const season = Number(exact[1]);
    const round = Number(exact[2]);
    const slot = Number(exact[3]);
    if (!Number.isFinite(season) || !Number.isFinite(round) || !Number.isFinite(slot)) {
      return null;
    }
    return { season, round, slot };
  }
  const round = ROUND_ONLY_RE.exec(name);
  if (round) {
    const season = Number(round[1]);
    const ord = round[2];
    const r = ord !== undefined ? ORDINAL_TO_ROUND[ord] : undefined;
    if (!Number.isFinite(season) || r === undefined) return null;
    return { season, round: r, slot: null };
  }
  return null;
}

export function formatPickName(p: PickIdentity): string {
  if (p.slot !== null) {
    return `${p.season} Pick ${p.round}.${String(p.slot).padStart(2, "0")}`;
  }
  const ord = ROUND_TO_ORDINAL[p.round];
  if (!ord) throw new Error(`Unsupported round ${p.round}`);
  return `${p.season} ${ord}`;
}

export function pickIdentityKey(p: PickIdentity): string {
  return formatPickName(p);
}
