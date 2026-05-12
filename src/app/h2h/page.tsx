import Link from "next/link";

import {
  Card,
  Kicker,
  ManagerAvatar,
  SectionHeader,
  StatTile,
} from "@/components/ui";
import { buildH2HMatrix, type H2HCell } from "@/lib/data";

export const dynamic = "force-static";

function winPct(cell: H2HCell): number | null {
  const total = cell.wins + cell.losses + cell.ties;
  if (total === 0) return null;
  return (cell.wins + cell.ties * 0.5) / total;
}

function cellColor(pct: number | null): string {
  if (pct === null) return "var(--surface)";
  // Green for high, red for low, neutral around 0.5.
  if (pct >= 0.85) return "rgba(34,197,94,0.78)";
  if (pct >= 0.7) return "rgba(34,197,94,0.55)";
  if (pct >= 0.55) return "rgba(34,197,94,0.32)";
  if (pct >= 0.45) return "rgba(245,181,74,0.18)";
  if (pct >= 0.3) return "rgba(239,68,68,0.32)";
  if (pct >= 0.15) return "rgba(239,68,68,0.55)";
  return "rgba(239,68,68,0.78)";
}

// Managers we want pinned to the trailing edge of the matrix (rightmost
// column / bottommost row). Matches against username or display name,
// case-insensitive, to survive Sleeper handle differences. Useful for
// newcomers with mostly-empty rows.
const TRAIL_NAME_MATCHERS = ["blakebehlen", "blake behlen"];

function isTrail(m: { username: string; displayName?: string }): boolean {
  const u = m.username.toLowerCase();
  const d = (m.displayName ?? "").toLowerCase();
  return TRAIL_NAME_MATCHERS.some(
    (n) => u === n.replace(/\s+/g, "") || u === n || d === n,
  );
}

function reorderTrailing<T extends { username: string; displayName?: string }>(
  items: T[],
): T[] {
  const lead = items.filter((m) => !isTrail(m));
  const trail = items.filter((m) => isTrail(m));
  return [...lead, ...trail];
}

export default async function H2HPage() {
  const matrix = await buildH2HMatrix();
  const managers = reorderTrailing(matrix.managers);

  const totalGames = (() => {
    let g = 0;
    for (const [, row] of matrix.cells) for (const [, cell] of row) g += cell.games;
    return g / 2; // each game is double-counted (A↔B, B↔A).
  })();

  // Find the most-played pair.
  let mostPlayed: { a: string; b: string; games: number } | null = null;
  // Find the most lopsided pair (max abs(winPct - 0.5) with at least 5 games).
  let mostLopsided:
    | { a: string; b: string; pct: number; record: string }
    | null = null;
  for (const [aId, row] of matrix.cells) {
    for (const [bId, cell] of row) {
      if (aId >= bId) continue; // dedup pair direction
      if (!mostPlayed || cell.games > mostPlayed.games) {
        mostPlayed = { a: aId, b: bId, games: cell.games };
      }
      const pct = winPct(cell);
      if (pct === null || cell.games < 5) continue;
      const lopsided = Math.abs(pct - 0.5);
      if (
        !mostLopsided ||
        lopsided > Math.abs(mostLopsided.pct - 0.5)
      ) {
        mostLopsided = {
          a: aId,
          b: bId,
          pct,
          record: `${cell.wins}-${cell.losses}${cell.ties ? `-${cell.ties}` : ""}`,
        };
      }
    }
  }

  function findManager(userId: string) {
    return managers.find((m) => m.userId === userId);
  }

  return (
    <main className="relative">
      <section className="relative overflow-hidden border-b border-border">
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 pt-10 pb-10 sm:pt-14 sm:pb-12">
          <SectionHeader
            kicker={`${managers.length} managers · ${Math.round(totalGames)} regular-season meetings`}
            title="Head to Head"
            description="All-time records between every pair, across every cached season. Read across rows: that manager's record vs. every other column."
            size="lg"
          />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-8 grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatTile
          label="Total meetings"
          value={Math.round(totalGames)}
          accent="primary"
          subValue="across all seasons"
        />
        {mostPlayed ? (
          <StatTile
            label="Most-played pair"
            value={mostPlayed.games}
            subValue={`@${findManager(mostPlayed.a)?.username} vs @${findManager(mostPlayed.b)?.username}`}
            animate={false}
          />
        ) : null}
        {mostLopsided ? (
          <StatTile
            label="Most-lopsided"
            value={`${(mostLopsided.pct * 100).toFixed(0)}%`}
            subValue={`@${findManager(mostLopsided.a)?.username} ${mostLopsided.record} vs @${findManager(mostLopsided.b)?.username}`}
            animate={false}
          />
        ) : null}
      </section>

      <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-8 sm:mt-10 flex flex-col gap-3">
        <Kicker>The Matrix</Kicker>
        <Card variant="default" padding="none" className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-xs">
            <thead>
              <tr>
                <th
                  scope="col"
                  className="sticky left-0 z-10 bg-surface px-2 py-2 text-left text-[10px] font-medium uppercase tracking-[0.18em] text-foreground-subtle border-b border-r border-border"
                >
                  vs
                </th>
                {managers.map((m) => (
                  <th
                    key={m.userId}
                    scope="col"
                    className="px-1 py-2 font-display italic text-[13px] text-foreground-muted border-b border-rule"
                    style={{ minWidth: 56 }}
                  >
                    <span className="block truncate max-w-[64px]" title={m.username}>
                      {m.username.length > 8 ? m.username.slice(0, 7) + "…" : m.username}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {managers.map((rowManager) => (
                <tr key={rowManager.userId}>
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-surface px-2 py-1 text-left border-b border-r border-border whitespace-nowrap"
                  >
                    <Link
                      href={`/managers/${rowManager.username}`}
                      className="flex items-center gap-2 group"
                    >
                      <ManagerAvatar manager={rowManager} size={22} ring="subtle" />
                      <span className="text-xs text-foreground group-hover:text-accent transition-colors truncate max-w-[120px]">
                        {rowManager.username}
                      </span>
                    </Link>
                  </th>
                  {managers.map((colManager) => {
                    if (colManager.userId === rowManager.userId) {
                      return (
                        <td
                          key={colManager.userId}
                          className="border-b border-border bg-foreground/[0.02]"
                          style={{ minWidth: 56, height: 40 }}
                        >
                          <span className="block text-center text-foreground-subtle text-[10px]">
                            —
                          </span>
                        </td>
                      );
                    }
                    const cell = matrix.cells
                      .get(rowManager.userId)
                      ?.get(colManager.userId);
                    const pct = cell ? winPct(cell) : null;
                    return (
                      <td
                        key={colManager.userId}
                        className="border-b border-border tabular text-center align-middle"
                        style={{
                          background: cellColor(pct),
                          minWidth: 56,
                          height: 40,
                        }}
                      >
                        {cell && cell.games > 0 ? (
                          <Link
                            href={`/h2h/${rowManager.username}/${colManager.username}`}
                            className="block w-full h-full flex flex-col items-center justify-center text-foreground hover:text-accent transition-colors"
                            title={`${rowManager.username} vs ${colManager.username}: ${cell.wins}-${cell.losses}${cell.ties ? `-${cell.ties}` : ""} (${cell.games} games)`}
                          >
                            <span className="text-[11px] font-medium leading-tight">
                              {cell.wins}-{cell.losses}
                              {cell.ties ? `-${cell.ties}` : ""}
                            </span>
                            <span className="text-[9px] text-foreground-subtle leading-tight">
                              {pct !== null ? `${(pct * 100).toFixed(0)}%` : ""}
                            </span>
                          </Link>
                        ) : (
                          <span className="block text-foreground-subtle text-[10px]">
                            —
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <p className="text-[11px] text-foreground-subtle">
          Cell color: green = winning record, red = losing record. Click a cell
          to drill into the per-week receipts.
        </p>
      </section>
    </main>
  );
}
