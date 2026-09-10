import Link from "next/link";
import { notFound } from "next/navigation";

import { LiveDraftRoom } from "@/components/live/LiveDraftRoom";
import {
  Card,
  EmptyState,
  ExpandableRow,
  Kicker,
  ManagerAvatar,
  Pill,
  PlayerImage,
  SectionHeader,
  StatTile,
} from "@/components/ui";
import { LEAGUE_NAME } from "@/config/site";
import {
  getDraftRecap,
  getDraftSummaries,
  getUpcomingDraftPreview,
  listCachedSeasons,
  type DraftPickResolved,
  type DraftRecap,
  type UpcomingDraftPreview,
} from "@/lib/data";

export const dynamic = "force-static";

interface PageProps {
  params: Promise<{ year: string }>;
}

export async function generateStaticParams() {
  const seasons = await listCachedSeasons();
  return seasons.map((year) => ({ year }));
}

export async function generateMetadata({ params }: PageProps) {
  const { year } = await params;
  return {
    title: `${year} Draft · ${LEAGUE_NAME}`,
    description: `Pick-by-pick board and retroactive value-at-pick for the ${year} rookie draft.`,
  };
}

export default async function DraftYearPage({ params }: PageProps) {
  const { year } = await params;
  const seasons = await listCachedSeasons();
  if (!seasons.includes(year)) notFound();

  // Upcoming-draft preview only surfaces on the latest cached year so
  // historical pages stay focused on their own season.
  const isLatest = seasons[0] === year;
  const upcoming = isLatest ? await getUpcomingDraftPreview() : null;

  // League-archive metrics (formerly on the /drafts index, now merged here).
  const summaries = await getDraftSummaries();
  const completedSummaries = summaries.filter((s) => s.status === "complete");
  const archiveTotalPicks = completedSummaries.reduce(
    (s, x) => s + x.totalPicks,
    0,
  );

  const recap = await getDraftRecap(year);

  // The static build only knows the draft's status as of the last ingest. On
  // the latest year, while that cached status is anything short of complete,
  // mount the live room: it polls Sleeper from the browser and takes over the
  // moment picks start landing, hours before the next rebuild.
  const liveRoom =
    isLatest && recap && recap.draft.status !== "complete" ? (
      <LiveDraftRoom
        draftId={recap.draft.draft_id}
        season={year}
        managers={recap.managers.list}
      />
    ) : null;

  if (!recap || recap.picks.length === 0) {
    return (
      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-16">
        <SectionHeader
          kicker={`${year} draft · ${recap?.draft.status.replace("_", " ") ?? "no data"}`}
          title={`${year} Draft`}
          description="No completed picks to display yet."
          size="lg"
        />
        {liveRoom}
        {/* The pre-draft page is exactly where the upcoming order matters
            most. Without this the section rendered nowhere: this path
            returned before reaching it, and past years are never isLatest. */}
        {upcoming ? (
          <UpcomingDraftSection preview={upcoming} />
        ) : (
          <div className="mt-8">
            <EmptyState
              title="Draft not played"
              description="Once picks are made, the board and retroactive analysis will populate here."
            />
          </div>
        )}
      </main>
    );
  }

  const totalPicks = recap.picks.length;
  const totalValue = recap.picks.reduce(
    (s, p) => s + Math.max(0, p.currentValue),
    0,
  );
  const top = [...recap.picks].sort((a, b) => b.currentValue - a.currentValue)[0];

  return (
    <main className="relative flex flex-col">
      <section className="relative overflow-hidden border-b border-border">
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 pt-10 pb-10 sm:pt-14 sm:pb-12">
          <SectionHeader
            kicker={`${year} Draft · ${capitalize(recap.draft.type)}`}
            title={`${year} Rookie Draft`}
            description={
              <>
                Retroactive value pinned to the FantasyCalc dynasty snapshot from{" "}
                <span className="text-foreground-muted tabular">{recap.snapshotDate}</span>.
                Value-at-pick compares the player&apos;s current dynasty value to the
                league-wide value of that draft slot today.
              </>
            }
            size="lg"
            actions={
              <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-1">
                {seasons.map((s) => (
                  <Link
                    key={s}
                    href={`/drafts/${s}`}
                    className={
                      s === year
                        ? "inline-flex min-h-11 lg:min-h-0 items-center px-3 lg:py-1 rounded-md bg-foreground/[0.06] text-foreground text-sm lg:text-xs font-medium tabular focus-hairline"
                        : "inline-flex min-h-11 lg:min-h-0 items-center px-3 lg:py-1 rounded-md text-foreground-muted hover:text-foreground hover:bg-foreground/[0.03] text-sm lg:text-xs tabular transition-colors focus-hairline"
                    }
                  >
                    {s}
                  </Link>
                ))}
              </div>
            }
          />
        </div>
      </section>

      {/* Cache caught the draft mid-run (status short of complete with some
          picks in): the live room keeps the board current from here. */}
      {liveRoom}

      {/* League-archive overview — context for the merged drafts page. On a
          phone it sits *after* the draft itself: it's all-time context, and
          leading with it pushed the first pick more than two screens down. */}
      <section className="order-last lg:order-none mx-auto max-w-6xl px-4 sm:px-6 mt-8 sm:mt-10 flex flex-col gap-3">
        <Kicker>League archive</Kicker>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatTile
            label="Completed drafts"
            value={completedSummaries.length}
            accent="primary"
            subValue="rookie drafts on file"
          />
          <StatTile
            label="Picks made"
            value={archiveTotalPicks}
            accent="secondary"
            subValue={`across ${completedSummaries.length} drafts`}
          />
          <StatTile
            label="Upcoming"
            value={upcoming ? upcoming.totalTradedPicks : 0}
            subValue={
              upcoming
                ? `${upcoming.totalTradedPicks} picks have changed hands for ${upcoming.season}`
                : "no draft scheduled"
            }
          />
        </div>
      </section>

      {upcoming ? <UpcomingDraftSection preview={upcoming} /> : null}

      <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-10 sm:mt-12 flex flex-col gap-3">
        <Kicker>Class of {year}</Kicker>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile
          label="Picks"
          value={totalPicks}
          accent="primary"
          subValue={`${recap.rounds} rounds`}
        />
        <StatTile
          label="Class value today"
          value={Math.round(totalValue)}
          subValue="sum of dynasty values"
          accent="primary"
        />
        {top ? (
          <StatTile
            label="Best player today"
            value={Math.round(top.currentValue)}
            subValue={`${top.playerName} · ${top.position} · pick ${top.pickNo}`}
            accent="secondary"
          />
        ) : null}
        <StatTile
          label="Current snapshot"
          value={recap.snapshotDate}
          subValue="value reference"
          animate={false}
        />
        </div>
      </section>

      {/* BREAKOUTS / BUSTS */}
      {recap.steals.length > 0 || recap.reaches.length > 0 ? (
        <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-10 sm:mt-14 flex flex-col gap-3">
          <p className="text-[12px] text-foreground-subtle leading-relaxed max-w-2xl">
            <span className="text-foreground-muted">Breakouts vs. Busts.</span>{" "}
            Each pick is compared to the typical asset value of that draft slot
            today. Players above their slot are breakouts; players well below
            are busts. Snapshot {recap.snapshotDate}.
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card variant="default" padding="lg">
              <div className="flex items-baseline justify-between mb-4">
                <Kicker>Breakouts</Kicker>
                <Pill tone="positive" size="sm">
                  exceeded slot
                </Pill>
              </div>
              <PickList rows={recap.steals} highlight="positive" />
            </Card>
            <Card variant="default" padding="lg">
              <div className="flex items-baseline justify-between mb-4">
                <Kicker>Busts</Kicker>
                <Pill tone="negative" size="sm">
                  under slot
                </Pill>
              </div>
              <PickList rows={recap.reaches} highlight="negative" />
            </Card>
          </div>
        </section>
      ) : null}

      {/* DRAFT BOARD — desktop grid. Board columns have a 180px minimum, so it
          stays above `lg` rather than taking over at 640px. */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-10 sm:mt-14 flex-col gap-4 hidden lg:flex">
        <Kicker>Pick-By-Pick Board</Kicker>
        <DraftBoard recap={recap} />
      </section>

      {/* DRAFT BY TEAM — canonical phone/tablet view */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-10 flex flex-col gap-3 lg:hidden">
        <Kicker>By Team</Kicker>
        <DraftByTeam recap={recap} />
      </section>
    </main>
  );
}

function PickList({
  rows,
  highlight,
}: {
  rows: DraftPickResolved[];
  highlight: "positive" | "negative";
}) {
  if (rows.length === 0) {
    return (
      <span className="text-sm text-foreground-subtle">
        Not enough data — picks need a slot baseline to compare.
      </span>
    );
  }
  return (
    <ol className="flex flex-col">
      {rows.map((p) => (
        <li
          key={`${p.pickNo}-${p.playerId}`}
          className="flex items-center gap-3 py-2 border-b border-border/50 last:border-b-0"
        >
          <span className="text-[10px] tabular text-foreground-subtle w-10 text-right">
            {p.round}.
            {String(p.slot).padStart(2, "0")}
          </span>
          <PlayerImage
            playerId={p.playerId}
            position={p.position}
            name={p.playerName}
            size={28}
          />
          <span className="flex flex-col min-w-0 flex-1">
            <span className="text-sm text-foreground truncate">
              {p.playerName}
            </span>
            <span className="text-[11px] tabular text-foreground-subtle truncate">
              {p.position}
              {p.team ? ` · ${p.team}` : ""} · @
              {p.manager?.username ?? "—"}
            </span>
          </span>
          <span className="flex flex-col items-end">
            <span
              className={
                "text-sm tabular " +
                (highlight === "positive" ? "text-positive" : "text-negative")
              }
            >
              {(p.delta ?? 0) >= 0 ? "+" : ""}
              {Math.round(p.delta ?? 0).toLocaleString()}
            </span>
            <span className="text-[10px] tabular text-foreground-subtle">
              now {Math.round(p.currentValue)} · slot {Math.round(p.slotBaseline ?? 0)}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function DraftBoard({ recap }: { recap: DraftRecap }) {
  // Round x slot grid. Slots come from the picks themselves; group by (round, slot).
  const slots = Array.from(
    new Set(recap.picks.map((p) => p.slot)),
  ).sort((a, b) => a - b);
  const rounds = Array.from(new Set(recap.picks.map((p) => p.round))).sort(
    (a, b) => a - b,
  );

  // index by `${round}-${slot}` → pick.
  const byKey = new Map<string, DraftPickResolved>();
  for (const p of recap.picks) byKey.set(`${p.round}-${p.slot}`, p);

  return (
    <Card variant="default" padding="none" className="overflow-x-auto">
      <table className="w-full text-xs border-separate border-spacing-0">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-surface px-2 py-2 text-left text-[10px] font-medium uppercase tracking-[0.18em] text-foreground-subtle border-b border-r border-border">
              Slot
            </th>
            {rounds.map((r) => (
              <th
                key={r}
                className="px-2 py-2 text-left text-[10px] font-medium uppercase tracking-[0.18em] text-foreground-subtle border-b border-border"
                style={{ minWidth: 180 }}
              >
                Round {r}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {slots.map((slot) => (
            <tr key={slot}>
              <th
                scope="row"
                className="sticky left-0 z-10 bg-surface px-2 py-1 text-left tabular text-[11px] text-foreground-subtle border-b border-r border-border"
              >
                {String(slot).padStart(2, "0")}
              </th>
              {rounds.map((round) => {
                const p = byKey.get(`${round}-${slot}`);
                return (
                  <td
                    key={round}
                    className="border-b border-border align-top"
                    style={{ minWidth: 180 }}
                  >
                    {p ? <DraftCell pick={p} /> : <span className="block px-2 py-2 text-foreground-subtle text-[11px]">—</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function DraftCell({ pick }: { pick: DraftPickResolved }) {
  const tone =
    pick.delta === null
      ? null
      : pick.delta > 0
        ? "positive"
        : pick.delta < 0
          ? "negative"
          : null;
  const deltaLabel =
    pick.delta === null
      ? null
      : `${pick.delta > 0 ? "+" : ""}${Math.round(pick.delta).toLocaleString()}`;
  return (
    <div className="px-2 py-2 flex items-center gap-2">
      <PlayerImage
        playerId={pick.playerId}
        position={pick.position}
        name={pick.playerName}
        size={26}
      />
      <span className="flex flex-col min-w-0 flex-1">
        <span className="text-[12px] text-foreground truncate">
          {pick.playerName}
        </span>
        <span className="text-[10px] tabular text-foreground-subtle truncate">
          {pick.position}
          {pick.team ? ` · ${pick.team}` : ""} ·{" "}
          {pick.manager ? `@${pick.manager.username}` : "—"}
        </span>
      </span>
      <span className="flex flex-col items-end shrink-0">
        <span className="text-[11px] tabular text-foreground">
          {Math.round(pick.currentValue)}
        </span>
        {deltaLabel && tone ? (
          <span
            className={
              "text-[10px] tabular " +
              (tone === "positive" ? "text-positive" : "text-negative")
            }
          >
            {deltaLabel}
          </span>
        ) : null}
      </span>
    </div>
  );
}

function DraftByTeam({ recap }: { recap: DraftRecap }) {
  // Group picks by manager, preserving Sleeper roster order.
  const groups = new Map<
    string,
    {
      manager: DraftPickResolved["manager"];
      managerName: string;
      username: string | null;
      picks: DraftPickResolved[];
    }
  >();
  for (const p of recap.picks) {
    const key = p.manager?.userId ?? `roster-${p.rosterId}`;
    const cur = groups.get(key);
    if (cur) {
      cur.picks.push(p);
    } else {
      groups.set(key, {
        manager: p.manager,
        managerName: p.manager?.displayName ?? `Roster ${p.rosterId}`,
        username: p.manager?.username ?? null,
        picks: [p],
      });
    }
  }
  // Sort each group's picks by pickNo for natural order.
  for (const g of groups.values()) {
    g.picks.sort((a, b) => a.pickNo - b.pickNo);
  }
  const ordered = [...groups.values()].sort((a, b) =>
    a.managerName.localeCompare(b.managerName),
  );

  return (
    <div className="flex flex-col gap-2">
      {ordered.map((g) => {
        const totalValue = g.picks.reduce(
          (s, p) => s + Math.max(0, p.currentValue),
          0,
        );
        return (
          <Card
            key={g.username ?? g.managerName}
            variant="default"
            padding="md"
          >
            <ExpandableRow
              label={`Show ${g.managerName} draft picks`}
              trigger={
                <div className="flex items-center gap-2.5">
                  {g.manager ? (
                    <ManagerAvatar
                      manager={g.manager}
                      size={28}
                      ring="subtle"
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="inline-block h-7 w-7 rounded-full bg-foreground/[0.04] shrink-0"
                    />
                  )}
                  <span className="text-sm text-foreground truncate flex-1 min-w-0">
                    {g.managerName}
                  </span>
                  <span className="text-[10px] tabular text-foreground-subtle">
                    {g.picks.length} picks
                  </span>
                  <span className="text-[11px] tabular text-foreground-muted">
                    {Math.round(totalValue)}
                  </span>
                </div>
              }
            >
              <ul className="flex flex-col">
                {g.picks.map((p) => (
                  <li
                    key={p.pickNo}
                    className="flex items-center gap-2 py-1.5 border-b border-border/40 last:border-b-0"
                  >
                    <span className="tabular text-[10px] text-foreground-subtle w-9 shrink-0">
                      {p.round}.{String(p.slot).padStart(2, "0")}
                    </span>
                    <PlayerImage
                      playerId={p.playerId}
                      position={p.position}
                      name={p.playerName}
                      size={22}
                    />
                    <span className="flex flex-col min-w-0 flex-1">
                      <span className="text-[12px] text-foreground truncate">
                        {p.playerName}
                      </span>
                      <span className="text-[10px] tabular text-foreground-subtle truncate">
                        {p.position}
                        {p.team ? ` · ${p.team}` : ""}
                      </span>
                    </span>
                    <span className="text-[11px] tabular text-foreground shrink-0">
                      {Math.round(p.currentValue)}
                    </span>
                    {p.delta !== null && p.delta !== 0 ? (
                      <span
                        className={
                          "text-[10px] tabular shrink-0 " +
                          (p.delta > 0 ? "text-positive" : "text-negative")
                        }
                      >
                        {p.delta > 0 ? "+" : ""}
                        {Math.round(p.delta)}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </ExpandableRow>
          </Card>
        );
      })}
    </div>
  );
}

function UpcomingDraftSection({ preview }: { preview: UpcomingDraftPreview }) {
  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-8 flex flex-col gap-4">
      <div className="flex flex-col lg:flex-row lg:items-baseline lg:justify-between gap-1 lg:gap-3">
        <Kicker>Upcoming · {preview.season}</Kicker>
        {/* Provenance matters here: a Sleeper-published order is the league's
            real order, a derived one is our guess. `orderNote` says which. */}
        <span className="text-[11px] tabular text-foreground-subtle">
          {preview.orderNote} · {preview.totalTradedPicks} picks traded
        </span>
      </div>
      <Card variant="default" padding="lg">
        {/* Phone/tablet: one card row per slot, grouped by round. The table
            needs a column per round, so on a phone reading the order meant
            panning sideways through what is fundamentally a numbered list.
            Round 1 is open by default; later rounds are one tap away. */}
        <div className="lg:hidden flex flex-col">
          {preview.rounds.map((round) => {
            const traded = round.slots.filter((s) => s.traded).length;
            return (
              <div
                key={round.round}
                className="border-b border-rule last:border-b-0 py-1 first:pt-0 last:pb-0"
              >
                <ExpandableRow
                  defaultOpen={round.round === 1}
                  label={`Show round ${round.round} order`}
                  trigger={
                    <div className="flex items-baseline gap-2">
                      <span className="font-display italic text-[17px] text-foreground leading-tight">
                        Round {round.round}
                      </span>
                      <span className="text-[11px] tabular text-foreground-subtle">
                        {round.slots.length} picks
                        {traded > 0 ? ` · ${traded} traded` : ""}
                      </span>
                    </div>
                  }
                >
                  <ul className="flex flex-col border-t border-rule">
                    {round.slots.map((slot) => (
                      <li
                        key={slot.slot}
                        className="border-b border-rule last:border-b-0"
                      >
                        <UpcomingPickRow round={round.round} slot={slot} />
                      </li>
                    ))}
                  </ul>
                </ExpandableRow>
              </div>
            );
          })}
        </div>

        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-rule">
                <th className="px-2 sm:px-3 h-10 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-subtle">
                  Slot
                </th>
                {preview.rounds.map((r) => (
                  <th
                    key={r.round}
                    className="px-2 sm:px-3 h-10 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-subtle"
                  >
                    Round {r.round}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.rounds[0]?.slots.map((_, slotIdx) => (
                <tr
                  key={slotIdx}
                  className="border-b border-rule last:border-b-0"
                >
                  <td className="px-2 sm:px-3 py-2 text-[11px] tabular text-foreground-subtle">
                    {slotIdx + 1}
                  </td>
                  {preview.rounds.map((round) => {
                    const slot = round.slots[slotIdx];
                    if (!slot) return <td key={round.round} />;
                    return (
                      <td key={round.round} className="px-2 sm:px-3 py-2">
                        <UpcomingPickCell slot={slot} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}

type UpcomingSlot = UpcomingDraftPreview["rounds"][number]["slots"][number];

function UpcomingPickRow({
  round,
  slot,
}: {
  round: number;
  slot: UpcomingSlot;
}) {
  const pickLabel = `${round}.${String(slot.slot).padStart(2, "0")}`;
  if (!slot.manager) {
    return (
      <span className="flex min-h-11 items-center gap-3 py-2 opacity-60">
        <span className="w-9 shrink-0 tabular text-[11px] text-foreground-subtle">
          {pickLabel}
        </span>
        <span className="text-[13px] text-foreground-subtle">
          Owner not set
        </span>
      </span>
    );
  }
  return (
    <Link
      href={`/managers/${slot.manager.username}`}
      className="flex min-h-11 items-center gap-3 py-2 hover:bg-row-hover transition-colors focus-hairline"
    >
      <span className="w-9 shrink-0 tabular text-[11px] text-foreground-subtle">
        {pickLabel}
      </span>
      <ManagerAvatar manager={slot.manager} size={28} ring="subtle" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[13px] text-foreground">
          @{slot.manager.username}
        </span>
        {slot.traded && slot.originalManager ? (
          <Pill tone="warning" size="sm" className="self-start max-w-full">
            via @{slot.originalManager.username}
          </Pill>
        ) : null}
      </span>
    </Link>
  );
}

function UpcomingPickCell({
  slot,
}: {
  slot: UpcomingSlot;
}) {
  if (!slot.manager) {
    return <span className="text-[11px] text-foreground-subtle">—</span>;
  }
  return (
    <Link
      href={`/managers/${slot.manager.username}`}
      className="flex items-center gap-2 group"
    >
      <ManagerAvatar manager={slot.manager} size={20} ring="subtle" />
      <span className="text-[12px] text-foreground group-hover:text-accent transition-colors truncate">
        @{slot.manager.username}
      </span>
      {slot.traded && slot.originalManager ? (
        <Pill tone="warning" size="sm" className="ml-auto shrink-0">
          via @{slot.originalManager.username}
        </Pill>
      ) : null}
    </Link>
  );
}

function capitalize(s: string): string {
  if (!s) return s;
  return s[0]!.toUpperCase() + s.slice(1);
}
