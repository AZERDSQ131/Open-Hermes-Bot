/**
 * Looking for a word in the conversation on screen.
 *
 * The window holds the transcript already, so a search is a walk over what is
 * there - nothing is asked of the host, and nothing it never sent is invented.
 * Only the two voices of the conversation are searched: an event line is a
 * note about a turn, not something a person said or read.
 */

export type Findable = { id: string; role: string; text: string };

/** The messages that hold the words, in the order they appear. Case never matters. */
export function findMatches(messages: Findable[], query: string): string[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return messages
    .filter(
      (message) =>
        (message.role === 'user' || message.role === 'assistant') &&
        message.text.toLowerCase().includes(needle),
    )
    .map((message) => message.id);
}

/** Where a step lands, wrapping at both ends of the list. */
export function stepFind(at: number, total: number, direction: 1 | -1): number {
  if (total <= 0) return 0;
  const next = (at + direction) % total;
  return next < 0 ? next + total : next;
}

export type MatchPiece = { text: string; hit: boolean };

/**
 * A line cut into what matched and what did not, so a bubble can mark exactly
 * the letters the person typed. The text is never rewritten: the pieces joined
 * back together are the line as it was stored.
 */
export function splitMatch(text: string, query: string): MatchPiece[] {
  const needle = query.trim();
  if (!needle) return [{ text, hit: false }];
  const haystack = text.toLowerCase();
  const wanted = needle.toLowerCase();
  const pieces: MatchPiece[] = [];
  let from = 0;
  let at = haystack.indexOf(wanted);
  while (at !== -1) {
    if (at > from) pieces.push({ text: text.slice(from, at), hit: false });
    pieces.push({ text: text.slice(at, at + needle.length), hit: true });
    from = at + needle.length;
    at = haystack.indexOf(wanted, from);
  }
  if (from < text.length) pieces.push({ text: text.slice(from), hit: false });
  return pieces;
}
