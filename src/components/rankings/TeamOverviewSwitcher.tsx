"use client";

import { Children, useState, type ReactNode } from "react";

import { Kicker } from "@/components/ui";

export interface TeamOverviewView {
  key: string;
  /** Tab label: "Dynasty", "Season", "Week 3". */
  label: string;
}

interface TeamOverviewSwitcherProps {
  views: readonly TeamOverviewView[];
  /** One rendered card per view, in the same order as `views`. */
  children: ReactNode;
}

const TAB_BASE =
  "inline-flex min-h-11 lg:min-h-0 items-center px-3 lg:py-1 rounded-md text-sm lg:text-xs transition-colors focus-hairline";
const TAB_ACTIVE = `${TAB_BASE} bg-foreground/[0.06] text-foreground font-medium`;
const TAB_IDLE = `${TAB_BASE} text-foreground-muted hover:text-foreground hover:bg-foreground/[0.03]`;

/**
 * Tabs over the team overview card. The cards are server-rendered and passed
 * in as children; this only decides which one is visible, so the data layer
 * stays on the server and the client bundle carries no rankings code.
 */
export function TeamOverviewSwitcher({
  views,
  children,
}: TeamOverviewSwitcherProps) {
  const panels = Children.toArray(children);
  const [selected, setSelected] = useState(views[0]?.key ?? "");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Kicker>Team overview</Kicker>
        {views.length > 1 ? (
          <div
            role="tablist"
            aria-label="Team overview views"
            className="flex items-center gap-1 rounded-lg border border-border bg-surface p-1"
          >
            {views.map((view) => {
              const active = view.key === selected;
              return (
                <button
                  key={view.key}
                  type="button"
                  role="tab"
                  id={`team-overview-tab-${view.key}`}
                  aria-selected={active}
                  aria-controls={`team-overview-panel-${view.key}`}
                  onClick={() => setSelected(view.key)}
                  className={active ? TAB_ACTIVE : TAB_IDLE}
                >
                  {view.label}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
      {views.map((view, index) => (
        <div
          key={view.key}
          id={`team-overview-panel-${view.key}`}
          role="tabpanel"
          aria-labelledby={`team-overview-tab-${view.key}`}
          hidden={view.key !== selected}
        >
          {panels[index]}
        </div>
      ))}
    </div>
  );
}
