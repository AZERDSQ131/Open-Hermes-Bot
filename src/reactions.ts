// The bot can react to a message with an emoji instead of writing a reply.
// Hermes has no reaction tool on the API surface this app talks to, so the
// affordance is a tiny protocol: an ephemeral system instruction asks the model
// to open its turn with `[[react:👍]]`, and the app turns that marker into a
// tapback on the user's bubble. The marker never reaches the transcript.

/**
 * The emoji a tapback can be: the ones a phone offers, and no more. A small
 * palette keeps the conversation calm and the bubbles readable.
 */
export const REACTION_EMOJI = ['❤️', '👍', '👎', '😂', '‼️', '❓'];

/** Appended to the system prompt for one turn; never stored in the history. */
export const REACTION_PROMPT = [
  'Grok Bot reactions: you may react to the user\'s latest message with a single emoji instead of writing a reply.',
  `To do it, start your reply with the marker [[react:👍]] on its own line (one of ${REACTION_EMOJI.join(' ')}).`,
  'Reach for it the way a person uses a tapback: sparingly, when a reaction is what you would actually do — acknowledging extra information, agreeing to a small adjustment, or when the emoji says everything.',
  'When the user sends several messages in a row, especially while you are already working, a quick reaction is often the right way to acknowledge the extras — prefer it to repeating them back, then continue with whatever they asked for. This is a nudge, not a rule: use it only when it genuinely fits.',
  'A reaction replaces an acknowledgement, never the work itself: if the messages ask for something, do it.',
  'Never react to a question that needs an answer, never more than once per turn, and never explain or mention the reaction.',
  'If the reaction already acknowledges the message and there is nothing else to do, reply with only the marker — no "got it", "OK", or restatement after it.',
  'Write after the marker only when you have something new to say or work to report, and put the marker first.',
].join(' ');

const MARKER = /\[\[react:\s*([^\]]{1,24}?)\s*\]\]/gi;
// A marker split across streaming chunks must not flash its syntax on screen.
const PARTIAL = /\[\[react:[^\]]*$/i;

/** True for one emoji (with its variation selectors / joiners), not prose. */
function isEmoji(value: string) {
  return (
    value.length <= 24 &&
    /\p{Extended_Pictographic}/u.test(value) &&
    !/[\p{L}\p{N}]/u.test(value)
  );
}

/** What a streaming bubble shows: the reply without the protocol. */
export function stripReactionMarkers(text: string): string {
  return text.replace(MARKER, '').replace(PARTIAL, '');
}

/**
 * Pull the first valid reaction out of a finished reply. Invalid markers are
 * removed too: the person should never see protocol syntax in a bubble.
 */
export function extractReaction(text: string): {
  emoji?: string;
  text: string;
} {
  let emoji: string | undefined;
  const cleaned = text.replace(MARKER, (_match, raw: string) => {
    const candidate = String(raw).trim();
    if (!emoji && isEmoji(candidate)) emoji = candidate;
    return '';
  });
  return {
    emoji,
    text: cleaned.trim(),
  };
}
