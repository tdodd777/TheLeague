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
