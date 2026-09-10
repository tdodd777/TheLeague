import type {
  SleeperRoster,
  SleeperUser,
} from "@/lib/sleeper";
import type { Manager } from "@/lib/types";

import { readRosters, readUsers, listCachedSeasons } from "./cache";

const SLEEPER_AVATAR_BASE = "https://sleepercdn.com/avatars";

function avatarUrl(user: SleeperUser): string {
  if (user.metadata?.avatar) return user.metadata.avatar;
  if (user.avatar) return `${SLEEPER_AVATAR_BASE}/thumbs/${user.avatar}`;
  return `${SLEEPER_AVATAR_BASE}/thumbs/default`;
}

function buildManager(
  user: SleeperUser,
  rosterId: number,
): Manager {
  return {
    userId: user.user_id,
    rosterId,
    username: user.display_name,
    displayName: user.metadata?.team_name ?? user.display_name,
    teamName: user.metadata?.team_name ?? null,
    avatar: user.avatar,
    avatarUrl: avatarUrl(user),
  };
}

export interface ManagerLookup {
  byUserId: Map<string, Manager>;
  byRosterId: Map<number, Manager>;
  byUsername: Map<string, Manager>;
  list: Manager[];
}

export function buildManagerLookup(
  users: SleeperUser[],
  rosters: SleeperRoster[],
): ManagerLookup {
  const userById = new Map<string, SleeperUser>();
  for (const u of users) userById.set(u.user_id, u);

  const list: Manager[] = [];
  const byUserId = new Map<string, Manager>();
  const byRosterId = new Map<number, Manager>();
  const byUsername = new Map<string, Manager>();

  for (const r of rosters) {
    if (!r.owner_id) continue;
    const user = userById.get(r.owner_id);
    if (!user) continue;
    const m = buildManager(user, r.roster_id);
    list.push(m);
    byUserId.set(m.userId, m);
    byRosterId.set(m.rosterId, m);
    byUsername.set(m.username.toLowerCase(), m);
  }

  list.sort((a, b) => a.username.localeCompare(b.username));
  return { byUserId, byRosterId, byUsername, list };
}

export async function getManagers(season: string): Promise<ManagerLookup> {
  const [users, rosters] = await Promise.all([
    readUsers(season),
    readRosters(season),
  ]);
  return buildManagerLookup(users, rosters);
}

/**
 * Resolve a manager across history. Some managers join later than others; the
 * canonical season is the most recent one in which they had a roster.
 */
export async function findManagerByUsername(
  username: string,
): Promise<{ manager: Manager; season: string } | null> {
  const seasons = await listCachedSeasons();
  for (const season of seasons) {
    const lookup = await getManagers(season);
    const m = lookup.byUsername.get(username.toLowerCase());
    if (m) return { manager: m, season };
  }
  return null;
}
