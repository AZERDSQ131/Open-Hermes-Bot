// Group conversations are a protocol, not a broadcast: every member gets the
// same transcript but decides on its own whether to react, speak, or stay out.
// A bot that stays silent writes `[[silent]]`; a bot that wants another bot to
// answer writes `@Name`. Both markers are plumbing and never reach a bubble.

import type { GroupMember, Message } from './data';
import { extractReaction } from './reactions';

/** Reply with this alone to sit a turn out. */
export const SILENT_MARKER = '[[silent]]';

const SILENT = /\[\[\s*silent\s*\]\]/gi;
const PARTIAL_SILENT = /\[\[\s*silen[^\]]*$/i;

// A group can talk itself into a loop ("@B" → "@A" → "@B"…). The round stops
// at this many spoken lines, and no member speaks more than twice per round.
export const MAX_GROUP_LINES = 8;
export const MAX_MEMBER_LINES = 2;

/** True when a streaming line is only a marker so far, not a reply. */
export function isSilentMarkerOnly(text: string): boolean {
  return !text.replace(SILENT, '').trim() && text.trim().length > 0;
}

export function stripSilentMarkers(text: string): string {
  return text.replace(SILENT, '').replace(PARTIAL_SILENT, '');
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * One pattern matching any member name after an @, longest first so
 * "@Chief of Staff" wins over a bot simply called "Chief". Names may carry
 * spaces; the lookahead keeps "@Sam" from matching inside "@Samuel".
 */
export function mentionPattern(names: string[]): RegExp {
  const clean = [...new Set(names.map((name) => name.trim()).filter(Boolean))]
    .sort((left, right) => right.length - left.length)
    .map(escapeRegExp);
  if (clean.length === 0) return /$^/g;
  return new RegExp(
    `@(${clean.join('|')})(?![\\p{L}\\p{N}_-])`,
    'giu',
  );
}

/** Members named in a line, matched against the group's roster. */
export function mentionsIn(text: string, members: GroupMember[]): GroupMember[] {
  const pattern = mentionPattern(members.map((member) => member.name));
  const found = new Set<string>();
  for (const match of text.matchAll(pattern)) {
    const wanted = String(match[1]).toLowerCase();
    const member = members.find(
      (candidate) => candidate.name.toLowerCase() === wanted,
    );
    if (member) found.add(member.id);
  }
  return members.filter((member) => found.has(member.id));
}

export type MentionSegment = { text: string; mention: boolean };

/** Split a line into plain and @mention pieces for rendering. */
export function splitMentions(text: string, members: GroupMember[]): MentionSegment[] {
  const pattern = mentionPattern(members.map((member) => member.name));
  const segments: MentionSegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > cursor) {
      segments.push({ text: text.slice(cursor, start), mention: false });
    }
    segments.push({ text: match[0], mention: true });
    cursor = start + match[0].length;
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), mention: false });
  }
  return segments.length ? segments : [{ text, mention: false }];
}

// The identical system prompt is sent to every member: the member's identity
// lives in the per-turn message, so a bot's stored session stays honest.
export function groupInstructions(groupName: string, members: GroupMember[]): string {
  const roster = members.map((member) => `@${member.name}`).join(', ');
  return [
    `Sidekick group chat: you are one member of “${groupName}”, talking with ${roster} and the person.`,
    'Each member answers on their own. You never write another member\'s words, and you never invent a line from the person.',
    'A turn has exactly three moves. Choose one:',
    `1. Stay silent. Reply with exactly ${SILENT_MARKER} and nothing else when the line is not for you, when someone else already answered it, when you agree with what was said, or when you have nothing that adds something. Silence is a normal, frequent choice in a group — most turns do not need every bot.`,
    `2. React. Start with a tapback marker like [[react:👍]] (one emoji) when a reaction says everything. ${SILENT_MARKER} and a reaction are alternatives: do not use both.`,
    '3. Speak. Write a short group message in your own voice. Say something the group does not already have: an answer, a fact, an objection, a decision. Do not restate the question or summarise the others.',
    'To talk to one member directly, write @TheirName inside your message. That member will get the next turn, so mention only a bot you actually want to answer you. Never mention a bot only as decoration.',
    'If the person asks the whole group a question, the members who know the answer should speak; the rest should stay silent rather than pad the thread.',
    'Write in the language the person used. No preamble, no "as a bot", no speaking for others.',
  ].join(' ');
}

/** What one member sees for its turn: the room, the transcript, and its cue. */
export function groupTurnMessage(input: {
  groupName: string;
  members: GroupMember[];
  speaker: GroupMember;
  history: Message[];
  addressed?: boolean;
  mentionedBy?: string;
}): string {
  const { groupName, members, speaker, history, addressed, mentionedBy } = input;
  const roster = members.map((member) => `@${member.name}`).join(', ');
  const transcript = formatTranscript(history);
  const cue = mentionedBy
    ? `@${mentionedBy} mentioned you by name. You have the floor now.`
    : addressed
      ? 'The person addressed you directly.'
      : 'The last line is new in the group.';
  return [
    `[Group chat “${groupName}” — members: ${roster}, and the person (shown as @You).]`,
    '',
    'Conversation so far:',
    transcript,
    '',
    `You are @${speaker.name}. ${cue}`,
    `It is your turn. Decide: ${SILENT_MARKER} to stay out, a reaction to acknowledge, or a message to the group. If you speak, keep it to what only you would add.`,
  ].join('\n');
}

const TRANSCRIPT_MESSAGES = 16;
const TRANSCRIPT_CHARS = 6000;

/** The room as the model reads it: every line attributed, tapbacks noted. */
export function formatTranscript(messages: Message[]): string {
  const recent = messages.slice(-TRANSCRIPT_MESSAGES);
  const lines = recent.map((message) => {
    if (message.role === 'event') return `(note) ${message.text}`;
    if (message.role === 'user') return `@You: ${message.text}`;
    const taps = (message.reactions ?? [])
      .map((reaction) => `${reaction.by ?? 'someone'} reacted ${reaction.emoji}`)
      .join(', ');
    const body = taps ? `${message.text} (${taps})` : message.text;
    return `${message.authorId ? `@${message.authorName ?? 'Bot'}` : 'Bot'}: ${body}`;
  });
  let text = lines.join('\n');
  if (text.length > TRANSCRIPT_CHARS) {
    text = `…\n${text.slice(-TRANSCRIPT_CHARS)}`;
  }
  return text;
}

export type GroupTurn = {
  /** The member chose to sit this one out (or wrote nothing useful). */
  silent: boolean;
  /** A tapback left instead of, or alongside, a line. */
  emoji?: string;
  /** The line to show in the group, marker-free. */
  text: string;
  /** Members named in the line, in roster order. */
  mentions: GroupMember[];
};

/**
 * Read one member's raw answer. The silent marker is binding: a bot that says
 * it is out does not get to leave a half-written reply behind it.
 */
export function readGroupTurn(
  raw: string,
  members: GroupMember[],
): GroupTurn {
  if (SILENT.test(raw)) {
    SILENT.lastIndex = 0;
    return { silent: true, text: '', mentions: [] };
  }
  SILENT.lastIndex = 0;
  const parsed = extractReaction(raw);
  const text = stripSilentMarkers(parsed.text).trim();
  if (!text && !parsed.emoji) {
    return { silent: true, text: '', mentions: [] };
  }
  return {
    silent: false,
    emoji: parsed.emoji,
    text,
    mentions: mentionsIn(text, members),
  };
}
