// A conversation on the phone is not a photograph either. While the app is
// open it reads the host again on a beat, so a turn sent from the desktop — or
// from another phone — lands here without anyone pulling the list. The rules
// are the desktop's, in the phone's own words: a line the host has stored is
// recognised by what it says and who said it, and never drawn twice.

import type { Message } from './data';

/** How often the host is read while the app is in front. */
export const LIVE_MS = 2500;

type Line = { from: string; text: string };

function sameLine(left: Line, right: Line): boolean {
  return left.from === right.from && left.text === right.text;
}

/**
 * The conversation on screen, with what the host holds now folded into it.
 * `null` when there is nothing new: no state to replace for nothing.
 */
export function mergeMessages(
  shown: Message[],
  read: Message[],
): Message[] | null {
  if (!read.length) return null;
  if (!shown.length) return read;

  const stored = new Map(read.map((message) => [message.id, message]));
  const next: Message[] = shown.slice();
  let changed = false;

  // A line the phone drew itself, now stored by the host under an id of its
  // own: it takes that id, so the next beat knows it is not a new line.
  for (let index = 0; index < next.length; index += 1) {
    const fresh = stored.get(next[index].id);
    if (!fresh) continue;
    if (sameLine(fresh, next[index])) continue;
    next[index] = fresh;
    changed = true;
  }

  const known = new Set(shown.map((message) => message.id));
  // Where the two copies still agree: what comes after was typed here and the
  // host has not caught up with it yet.
  let lastShared = -1;
  shown.forEach((message, index) => {
    if (stored.has(message.id)) lastShared = index;
  });
  const echoes: number[] = [];
  for (let index = lastShared + 1; index < next.length; index += 1) {
    if (!stored.has(next[index].id)) echoes.push(index);
  }

  const fresh: Message[] = [];
  let echo = 0;
  for (const message of read) {
    if (known.has(message.id)) continue;
    // The host's copy of the line this phone already drew: the same words,
    // now with the host's id — and no longer an echo, so a later turn that
    // says the same thing is its own line.
    if (echo < echoes.length && sameLine(shown[echoes[echo]], message)) {
      next[echoes[echo]] = message;
      changed = true;
      echo += 1;
      continue;
    }
    fresh.push(message);
  }

  if (!fresh.length) return changed ? next : null;
  if (fresh.length === read.length) return read;
  return [...next, ...fresh];
}
