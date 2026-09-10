export type ManagerMode = "Win Now" | "Dynasty" | "Rebuild";
export type RookieOrVets = "Rookies" | "Vets";
export type ContactMethod =
  | "Text"
  | "Email"
  | "Phone"
  | "Sleeper"
  | "WhatsApp"
  | "Discord"
  | "Carrier Pigeon";

export interface ManagerOverride {
  realName?: string;
  location?: string;
  bio?: string;
  fantasyStart?: number;
  favoriteTeam?: string;
  favoritePlayerId?: string;
  valuePosition?: "QB" | "RB" | "WR" | "TE" | "K" | "DEF";
  mode?: ManagerMode;
  rookieOrVets?: RookieOrVets;
  tradingScale?: number;
  philosophy?: string;
  preferredContact?: ContactMethod;
  rivalUserId?: string;
  accentColor?: string;
}

export const managerOverrides: Record<string, ManagerOverride> = {};

/**
 * Managers to pin to the trailing edge of the head-to-head matrix (rightmost
 * column and bottommost row). Each entry is matched case-insensitively against
 * a manager's Sleeper username or team name, so it survives handle changes.
 *
 * Useful when someone joined recently and their row is mostly empty: pinning
 * them last keeps the dense, interesting part of the grid in the top left.
 * Leave this empty to keep Sleeper's own ordering.
 */
export const trailingManagers: string[] = [];
