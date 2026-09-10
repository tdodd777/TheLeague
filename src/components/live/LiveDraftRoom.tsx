"use client";

import {
  Card,
  ExpandableRow,
  Kicker,
  ManagerAvatar,
  Pill,
  PlayerImage,
} from "@/components/ui";
import type { SleeperDraftPick } from "@/lib/sleeper";
import type { Manager } from "@/lib/types";

import {
  draftClock,
  draftTotalPicks,
  pickLabel,
  pickPlayer,
} from "./draft-clock";
import { useLiveDraft } from "./useLiveDraft";

interface Props {
  draftId: string;
  season: string;
  managers: Manager[];
}

/** How many upcoming picks the "up next" strip shows after the clock. */
const UP_NEXT = 3;

/**
 * The live draft room. The site is statically built from cached data, so
 * while the draft is actually running the prerendered page still says
 * pre_draft — this component polls Sleeper from the browser and takes over
 * the story: who is on the clock, what just happened, the board so far.
 *
 * It renders nothing until the first poll lands (the static upcoming-order
 * section below it carries the page until then), a slim scheduled strip
 * before the room opens, and the full room once picks are live. When the
 * draft completes it keeps the final board on screen with a note that the
 * value recap arrives with the next data refresh.
 */
export function LiveDraftRoom({ draftId, season, managers }: Props) {
  const { draft, picks, tradedPicks, lastUpdated, error } = useLiveDraft({
    draftId,
  });

  if (!draft) return null;

  if (draft.status === "pre_draft") {
    const start = draft.start_time ? new Date(draft.start_time) : null;
    return (
      <section className="mx-auto w-full max-w-6xl px-4 sm:px-6 mt-8">
        <Card variant="default" padding="md">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="relative flex h-2 w-2">
              <span className="relative inline-flex h-2 w-2 rounded-full bg-warning" />
            </span>
            <span className="text-sm text-foreground">
              Draft room · not open yet
            </span>
            <span className="text-[11px] tabular text-foreground-subtle">
              {start
                ? `scheduled ${start.toLocaleString([], {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}`
                : "no start time published"}
              {" · "}
              {draft.settings.teams} teams · {draft.settings.rounds} rounds
            </span>
          </div>
        </Card>
      </section>
    );
  }

  const madePicks = picks ?? [];
  const total = draftTotalPicks(draft);
  const clock =
    draft.status === "complete"
      ? null
      : draftClock(draft, madePicks, tradedPicks ?? [], managers);
  const upNext = clock
    ? Array.from({ length: UP_NEXT }, (_, i) =>
        draftClock(draft, madePicks, tradedPicks ?? [], managers, i + 1),
      ).filter((c) => c !== null)
    : [];
  const latest = [...madePicks].sort((a, b) => b.pick_no - a.pick_no);
  const currentRound = clock?.round ?? draft.settings.rounds;

  return (
    <section className="mx-auto w-full max-w-6xl px-4 sm:px-6 mt-8 flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <Kicker>
          <span className="inline-flex items-center gap-2">
            {draft.status === "drafting" ? (
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-positive opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-positive" />
              </span>
            ) : null}
            {draft.status === "complete"
              ? `${season} Draft · Complete`
              : `Live · ${season} Rookie Draft`}
          </span>
        </Kicker>
        <span className="text-[11px] tabular text-foreground-subtle">
          {madePicks.length}/{total} picks
          {lastUpdated
            ? ` · updated ${new Date(lastUpdated).toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              })}`
            : ""}
        </span>
      </div>

      {clock ? (
        <Card variant="default" padding="lg">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <span className="font-display italic text-[2rem] sm:text-[2.5rem] leading-none tabular text-foreground shrink-0">
                {pickLabel(clock.round, clock.slot)}
              </span>
              {clock.manager ? (
                <ManagerAvatar manager={clock.manager} size={40} ring="subtle" />
              ) : null}
              <span className="flex min-w-0 flex-col">
                <span className="text-[11px] uppercase tracking-[0.18em] text-foreground-subtle">
                  {draft.status === "paused" ? "Paused" : "On the clock"}
                </span>
                <span className="truncate text-base text-foreground">
                  {clock.manager?.displayName ?? "Owner not set"}
                </span>
                {clock.traded && clock.originalManager ? (
                  <Pill tone="warning" size="sm" className="mt-1 self-start">
                    via @{clock.originalManager.username}
                  </Pill>
                ) : null}
              </span>
              {draft.status === "paused" ? (
                <Pill tone="warning" size="sm" className="ml-auto shrink-0">
                  draft paused
                </Pill>
              ) : null}
            </div>
            {upNext.length > 0 ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-rule pt-3">
                <span className="text-[10px] uppercase tracking-[0.18em] text-foreground-subtle">
                  Up next
                </span>
                {upNext.map((c) => (
                  <span
                    key={c.pickNo}
                    className="inline-flex items-center gap-1.5 text-[11px] text-foreground-muted"
                  >
                    <span className="tabular text-foreground-subtle">
                      {pickLabel(c.round, c.slot)}
                    </span>
                    {c.manager ? `@${c.manager.username}` : "—"}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}

      {draft.status === "complete" ? (
        <p className="text-[12px] text-foreground-subtle leading-relaxed max-w-2xl">
          The board is final. Value-at-pick analysis lands here after the next
          data refresh.
        </p>
      ) : null}

      {latest.length > 0 ? (
        <Card variant="default" padding="md">
          <Kicker className="mb-3">Board</Kicker>
          <div className="flex flex-col">
            {groupByRound(latest).map(({ round, rows }) => (
              <div
                key={round}
                className="border-b border-rule last:border-b-0 py-1 first:pt-0 last:pb-0"
              >
                <ExpandableRow
                  defaultOpen={round === currentRound}
                  label={`Show round ${round} picks`}
                  trigger={
                    <div className="flex items-baseline gap-2">
                      <span className="font-display italic text-[17px] text-foreground leading-tight">
                        Round {round}
                      </span>
                      <span className="text-[11px] tabular text-foreground-subtle">
                        {rows.length} of {draft.settings.teams} picks in
                      </span>
                    </div>
                  }
                >
                  <ul className="flex flex-col border-t border-rule">
                    {rows.map((p) => (
                      <li
                        key={p.pick_no}
                        className="border-b border-rule last:border-b-0"
                      >
                        <LivePickRow pick={p} managers={managers} />
                      </li>
                    ))}
                  </ul>
                </ExpandableRow>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {error ? (
        <p className="text-xs text-foreground-subtle">
          Live polling hiccup: {error}. Will retry shortly.
        </p>
      ) : null}
    </section>
  );
}

/** Rounds newest-first, picks within a round newest-first — a live feed. */
function groupByRound(
  newestFirst: SleeperDraftPick[],
): Array<{ round: number; rows: SleeperDraftPick[] }> {
  const byRound = new Map<number, SleeperDraftPick[]>();
  for (const p of newestFirst) {
    const arr = byRound.get(p.round) ?? [];
    arr.push(p);
    byRound.set(p.round, arr);
  }
  return [...byRound.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([round, rows]) => ({ round, rows }));
}

function LivePickRow({
  pick,
  managers,
}: {
  pick: SleeperDraftPick;
  managers: Manager[];
}) {
  const player = pickPlayer(pick);
  const manager =
    managers.find((m) => m.rosterId === pick.roster_id) ??
    managers.find((m) => m.userId === pick.picked_by) ??
    null;
  return (
    <span className="flex min-h-11 items-center gap-3 py-2">
      <span className="w-9 shrink-0 tabular text-[11px] text-foreground-subtle">
        {pickLabel(pick.round, pick.draft_slot)}
      </span>
      <PlayerImage
        playerId={pick.player_id}
        position={player.position}
        name={player.name}
        size={28}
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[13px] text-foreground">
          {player.name}
        </span>
        <span className="truncate text-[11px] tabular text-foreground-subtle">
          {player.position}
          {player.team ? ` · ${player.team}` : ""} · @
          {manager?.username ?? "—"}
        </span>
      </span>
      {manager ? (
        <ManagerAvatar manager={manager} size={24} ring="subtle" />
      ) : null}
    </span>
  );
}
