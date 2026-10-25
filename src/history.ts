// A past conversation: a session Hermes already holds and the app did not
// open — one the CLI wrote, another client, or an older install. The app
// draws it and keeps nothing: it is the same session, continued in place.
//
// The host read is not written yet. `simulatedPastSessions` stands in for it,
// and it is the only thing here that has to go when `/api/sessions` is asked
// without the `source=api_server` filter: the grouping, the fold, the search
// and the dates are the seam that read will plug into.

import type { Message, SingleAvatar, Thread } from './data';
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
 * mystery. Folded, one group shows `PAST_PREVIEW` conversations; the rest is
 * counted, never lost.
 */
export function viewPastConversations(
  groups: PastGroup[],
  options: { query?: string; all?: boolean } = {},
): PastView {
  const needle = (options.query ?? '').trim().toLowerCase();
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
      sessions: options.all ? sessions : sessions.slice(0, PAST_PREVIEW),
    });
  }

  const shown = matched.reduce((sum, group) => sum + group.sessions.length, 0);
  return { groups: matched, total, hidden: total - shown };
}

// ------------------------------------------------------------ the simulation

/**
 * The sessions the host would answer with, made up for now: a few per bot, at
 * dates that age as the window stays open. Deterministic, so a screenshot and
 * a test see the same room. Delete with the read.
 */
const SIMULATED_TITLES = [
  'Bridge audit',
  'Tunnel refactor',
  'Release checklist',
  'Weekly notes',
  'VPS migration',
  'Model picks',
];

const SIMULATED_AGES = [2 * HOUR, 2 * DAY, 6 * DAY, 21 * DAY];

export function simulatedPastSessions(
  threads: Thread[],
  now: number = Date.now(),
): PastSession[] {
  const bots = threads.filter((thread) => !thread.members);
  const sessions: PastSession[] = [];

  bots.forEach((bot, index) => {
    const key = profileKey(bot.profile);
    // One bot holds more than the fold shows, so "the others" has something
    // to count in a window nobody has used yet.
    const count = index % 2 === 0 ? 4 : 2;
    for (let slot = 0; slot < count; slot += 1) {
      const title = SIMULATED_TITLES[(index * 3 + slot) % SIMULATED_TITLES.length];
      sessions.push({
        id: `past:${key}:${slot}`,
        // A session the CLI never named: the row has to read as something.
        title: index === 0 && slot === 1 ? '' : title,
        profile: bot.profile,
        messageCount: 4 + slot * 9 + index * 3,
        lastActive: now - SIMULATED_AGES[slot % SIMULATED_AGES.length],
      });
    }
  });

  return sessions;
}

/**
 * The first lines of a past conversation, made up for now. The event says
 * where the lines come from, so nobody mistakes the preview for the session.
 */
export function simulatedTranscript(session: PastSession): Message[] {
  const messages = session.messageCount;
  return [
    {
      id: `${session.id}:event`,
      role: 'event',
      text: `This session lives on the host — ${messages} messages, in the profile that holds it. Reading it back here is the next step.`,
    },
    {
      id: `${session.id}:opening`,
      role: 'user',
      text: 'Picking this back up.',
    },
    {
      id: `${session.id}:answer`,
      role: 'assistant',
      text: `Still here. The session kept all ${messages} messages, and the next word goes into the same one.`,
    },
  ];
}

/**
 * The answer a past conversation gives for now. It says what it is: nothing
 * reached the host, because there is no read or turn on a session the app did
 * not open yet.
 */
export function simulatedReply(session: PastSession): Message {
  return {
    id: `${session.id}:reply:${Date.now()}`,
    role: 'assistant',
    text: 'This reply is simulated: the host read lands with the backend, and nothing has reached Hermes.',
  };
}
