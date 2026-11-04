// A conversation that is open is not a photograph. While the window is in
// front the host is read again, so a turn sent from the phone — or from
// another machine — lands here without anyone pressing anything. The rules
// are here rather than in the window: how often a read is worth making, when
// a session has moved, and how a transcript that grew is folded into the one
// on screen without painting a line twice.

import type { HermesSession } from './hermes';

/** How often the host is asked what it holds. */
export const LIVE_MS = 2500;

/** One read of the profiles in this many ticks: a bot is a rarer thing than
 * a message, and listing them costs the host a shell. */
export const PROFILE_EVERY = 12;

/** A line of a conversation, as the window keeps it and as the host reads it. */
export type LiveLine = {
  id: string;
  role?: string;
  text: string;
};

/** The fields of a session that say whether there is anything new to read. */
type SessionFacts = Pick<
  HermesSession,
  'id' | 'title' | 'messageCount' | 'lastActive' | 'archived'
>;

/**
 * What a session looks like from the outside: its identity and how far it has
 * grown. Two equal digests mean there is nothing new to read.
 */
export function sessionDigest(sessions: SessionFacts[] | undefined): string {
  if (!sessions?.length) return '';
  return [...sessions]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(
      (session) =>
        `${session.id}:${session.title}:${session.messageCount}:${session.lastActive}:${
          session.archived ? 1 : 0
        }`,
    )
    .join('|');
}

function sameLine(left: LiveLine, right: LiveLine): boolean {
  return left.role === right.role && left.text === right.text;
}

/**
 * The conversation on screen, with what the host holds now folded into it.
 *
 * The host is the truth, but the window also draws lines of its own: the
 * message just typed, the answer still arriving, a note that a turn stopped.
 * A line the host has stored comes back with an id of its own, so the same
 * words are recognised by role and text and not added twice. `null` means
 * there is nothing to do — and no state to replace for nothing.
 */
export function mergeTranscript<T extends LiveLine>(
  shown: T[],
  read: T[],
): T[] | null {
  if (!read.length) return null;
  if (!shown.length) return read;

  const stored = new Map(read.map((line) => [line.id, line]));
  const next: T[] = shown.slice();
  let changed = false;

  // A line the window drew itself, now stored by the host under an id of its
  // own: it takes that id, so the next beat knows it is not a new line.
  for (let index = 0; index < next.length; index += 1) {
    const fresh = stored.get(next[index].id);
    if (!fresh) continue;
    if (sameLine(fresh, next[index])) continue;
    next[index] = fresh;
    changed = true;
  }

  const known = new Set(shown.map((line) => line.id));
  // Where the two copies still agree: everything after it was drawn here and
  // the host has not given it an id yet.
  let lastShared = -1;
  shown.forEach((line, index) => {
    if (stored.has(line.id)) lastShared = index;
  });
  const echoes: number[] = [];
  for (let index = lastShared + 1; index < next.length; index += 1) {
    const line = next[index];
    if (!stored.has(line.id) && line.role !== 'event') echoes.push(index);
  }

  const fresh: T[] = [];
  let echo = 0;
  for (const line of read) {
    if (known.has(line.id)) continue;
    // The host's copy of the line this window already drew: the same words,
    // now with the host's id. It is taken, not added again — and no longer
    // an echo, so a later turn that says the same thing is its own line.
    if (echo < echoes.length && sameLine(shown[echoes[echo]], line)) {
      next[echoes[echo]] = line;
      changed = true;
      echo += 1;
      continue;
    }
    fresh.push(line);
  }

  if (!fresh.length) return changed ? next : null;
  // Nothing on screen is on the host any more: the transcript was replaced,
  // or the session is not the one that was open. What the host holds wins.
  if (fresh.length === read.length) return read;
  return [...next, ...fresh];
}
