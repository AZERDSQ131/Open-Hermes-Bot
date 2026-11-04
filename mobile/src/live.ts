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
  let edited = false;
  const next = shown.map((message) => {
    const fresh = stored.get(message.id);
    if (!fresh) return message;
    if (sameLine(fresh, message)) return message;
    edited = true;
    return fresh;
  });

  const known = new Set(shown.map((message) => message.id));
  // Where the two copies still agree: what comes after was typed here and the
  // host has not caught up with it yet.
  let lastShared = -1;
  shown.forEach((message, index) => {
    if (stored.has(message.id)) lastShared = index;
  });
  const echoes = shown.slice(lastShared + 1).filter((message) => !stored.has(message.id));

  const fresh: Message[] = [];
  for (const message of read) {
    if (known.has(message.id)) continue;
    if (echoes.length && sameLine(echoes[0], message)) {
      echoes.shift();
      continue;
    }
    fresh.push(message);
  }

  if (!fresh.length) return edited ? next : null;
  if (fresh.length === read.length) return read;
  return [...next, ...fresh];
}
