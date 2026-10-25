// A past conversation: a session Hermes already holds and the app did not
// open — one the CLI wrote, another client, or an older install. The app
// draws it and keeps nothing: it is the same session, continued in place.
//
// The host answers with every session of a profile (`hermes:history`); this
// file decides what that answer means. What the sidebar already shows is not
// listed again, an archived row stays archived, and a group is rebuilt from
// its members rather than counted here. What is left is grouped under the bot
// whose profile holds it, folded, searched and dated.

import type { SingleAvatar, Thread } from './data';
import { parseGroupSessionTitle } from './conversations';
import { profileKey } from './modelPrefs';
import { avatarColor } from './profileColor';

/** What a session with no title reads as: the CLI does not always name one. */
export const UNTITLED = 'Untitled conversation';

/** How many conversations one group shows before the rest is offered. */
export const PAST_PREVIEW = 3;

/** The name the primary profile wears when no bot is there to call it. */
const PRIMARY_NAME = 'Chief of Staff';

/** One conversation the host already held. */
export type PastSession = {
  id: string;
  title: string;
  /** The profile that holds it; absent is the primary one. */
  profile?: string;
  messageCount: number;
  /** Epoch milliseconds, as the host writes it. */
  lastActive: number;
  archived: boolean;
};

/** The conversations one bot owns, under the face it wears. */
export type PastGroup = {
  key: string;
  name: string;
  profile?: string;
  avatar: SingleAvatar;
  sessions: PastSession[];
};

/** What the section shows: the groups, how many there are, how many are folded. */
export type PastView = {
  groups: PastGroup[];
  total: number;
  hidden: number;
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** The title as it is read: a session with none is not a blank row. */
export function pastTitle(session: PastSession): string {
  return session.title.trim() || UNTITLED;
}

/**
 * How long ago a conversation was spoken in, at the length a row allows: the
 * minutes while they matter, then the day, then the date.
 */
export function relativeDay(now: number, lastActive: number): string {
  const elapsed = Math.max(0, now - lastActive);
  if (elapsed < MINUTE) return 'now';
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} m`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)} h`;
  if (elapsed < WEEK) return `${Math.floor(elapsed / DAY)} d`;
  if (elapsed < 5 * WEEK) return `${Math.floor(elapsed / WEEK)} w`;
  const day = new Date(lastActive);
  return `${day.getDate()} ${MONTHS[day.getMonth()]}`;
}

/** The day a conversation started, spelled out, for the notice it carries. */
export function shortDay(at: number): string {
  const day = new Date(at);
  return `${day.getDate()} ${MONTHS[day.getMonth()]}`;
}

/**
 * What the section may list: the host's answer, minus what the window already
 * shows. The sidebar links a bot to its session by title, so a session whose
 * title is a bot's name is that bot's conversation — listed twice it would
 * read as two rooms with one history. A group is not one of these either: it
 * is rebuilt from the titles of its members.
 */
export function visiblePastSessions(
  sessions: PastSession[],
  threads: Thread[],
): PastSession[] {
  const takenTitles = new Set<string>();
  const takenIds = new Set<string>();
  for (const thread of threads) {
    if (thread.members) continue;
    takenTitles.add(thread.name.trim().toLowerCase());
    if (thread.sessionId) takenIds.add(thread.sessionId);
  }

  return sessions.filter((session) => {
    if (session.archived) return false;
    if (parseGroupSessionTitle(session.title)) return false;
    if (takenIds.has(session.id)) return false;
    return !takenTitles.has(session.title.trim().toLowerCase());
  });
}

/**
 * A past conversation belongs to the bot that owns its profile: a session is
 * held by a profile, and the bot is the face the app gives that profile. A
 * profile with no bot still has a face — its own hue — because the session is
 * there and hiding it would be a lie.
 */
function faceOf(bot: Thread | undefined, profile?: string): SingleAvatar {
  if (bot && bot.avatar.kind !== 'group') return bot.avatar;
  return {
    color: avatarColor(undefined, profile ?? 'default'),
    shape: 'cercle',
    variant: 'neutral',
  };
}

/**
 * The conversations, grouped by the bot that owns them: the primary bot first,
 * then the bot spoken to most recently. A group holds no session of its own,
 * so it never appears here.
 */
export function groupPastSessions(
  sessions: PastSession[],
  threads: Thread[],
): PastGroup[] {
  const bots = new Map<string, Thread>();
  for (const thread of threads) {
    if (thread.members) continue;
    bots.set(profileKey(thread.profile), thread);
  }

  const held = new Map<string, PastSession[]>();
  for (const session of sessions) {
    const key = profileKey(session.profile);
    const list = held.get(key) ?? [];
    list.push(session);
    held.set(key, list);
  }

  const groups: PastGroup[] = [];
  for (const [key, list] of held) {
    const bot = bots.get(key);
    const profile = key === 'default' ? undefined : key;
    groups.push({
      key,
      profile,
      name: bot?.name ?? profile ?? PRIMARY_NAME,
      avatar: faceOf(bot, profile),
      sessions: [...list].sort((a, b) => b.lastActive - a.lastActive),
    });
  }

  return groups.sort(
    (a, b) =>
      Number(b.key === 'default') - Number(a.key === 'default') ||
      latest(b) - latest(a),
  );
}

/** When a group was last spoken to: the newest of what it holds. */
function latest(group: PastGroup): number {
  return group.sessions.reduce(
    (newest, session) => Math.max(newest, session.lastActive),
    0,
  );
}

/**
 * What the section shows. The search reads the title only: the transcript is
 * not in the window, and a row that matched a word nobody can see would be a
 * mystery. Folded, one group shows `PAST_PREVIEW` conversations and the rest
 * is counted, never lost — but a search is a question rather than a browse,
 * so it shows every match it found.
 */
export function viewPastConversations(
  groups: PastGroup[],
  options: { query?: string; all?: boolean } = {},
): PastView {
  const needle = (options.query ?? '').trim().toLowerCase();
  const showAll = Boolean(options.all) || needle.length > 0;
  const matched: PastGroup[] = [];
  let total = 0;

  for (const group of groups) {
    const sessions = needle
      ? group.sessions.filter((session) =>
          pastTitle(session).toLowerCase().includes(needle),
        )
      : group.sessions;
    if (!sessions.length) continue;
    total += sessions.length;
    matched.push({
      ...group,
      sessions: showAll ? sessions : sessions.slice(0, PAST_PREVIEW),
    });
  }

  const shown = matched.reduce((sum, group) => sum + group.sessions.length, 0);
  return { groups: matched, total, hidden: total - shown };
}
