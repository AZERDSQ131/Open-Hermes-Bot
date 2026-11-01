/**
 * The words a bubble hands to the clipboard.
 *
 * A transcript is not all conversation: an event line ("the bot could not
 * answer") and a group's live preview are notes about the turn, not words the
 * person wrote or received, so they are not offered for copying. Protocol
 * markers never reach a bubble in the first place, so the text here is already
 * what the person sees.
 */
export function copyableText(message: { role: string; text: string }): string {
  if (message.role !== 'user' && message.role !== 'assistant') return '';
  return message.text.trim();
}

/** What the button says it does, for a screen reader and a tooltip. */
export const COPY_LABEL = 'Copy message';

/** What the chip itself reads, short enough to sit on a corner. */
export const COPY_WORD = 'Copy';

/** What it says once the line is on the clipboard. */
export const COPIED_LABEL = 'Copied';
