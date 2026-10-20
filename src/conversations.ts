// A conversation lives in a Hermes session: the app keeps no copy of it, and
// this module is the seam between what the gateway stores and what the app
// shows. It knows the titles that link a thread to its session, and it reads
// a transcript back out of the sessions a group is made of.

import type { GroupMember, Message } from './data';
import type { HermesMessage, HermesSession } from './hermes';
import { readGroupTurn, silentReaction, stripSilentMarkers } from './group';
import { extractReaction } from './reactions';

/** The prefix that keeps a group conversation apart from a private one. */
export const GROUP_TITLE_PREFIX = 'Group · ';

/** The title a member's conversation carries inside a group. */
export function groupSessionTitle(groupName: string, memberName: string) {
  return `${GROUP_TITLE_PREFIX}${groupName} · ${memberName}`;
}

/**
 * The group and the member a session title points at, when it points at one.
 * The group name may itself hold a separator, so the split happens on the last
 * one: the member is what comes after it.
 */
export function parseGroupSessionTitle(
  title: string,
): { group: string; member: string } | null {
  const trimmed = title.trim();
  if (!trimmed.startsWith(GROUP_TITLE_PREFIX)) return null;
  const rest = trimmed.slice(GROUP_TITLE_PREFIX.length);
  const cut = rest.lastIndexOf(' · ');
  if (cut <= 0) return null;
  const group = rest.slice(0, cut).trim();
  const member = rest.slice(cut + 3).trim();
  if (!group || !member) return null;
  return { group, member };
}

function mostRecent(sessions: HermesSession[]) {
  return [...sessions].sort((left, right) => right.lastActive - left.lastActive)[0];
}

/**
 * The conversation of a thread: the session Hermes holds under that name. An
 * exact title wins; a title the app had to suffix because the name was taken
 * is the next best thing.
 */
export function findSession(
  name: string,
  sessions: HermesSession[],
): HermesSession | undefined {
  const wanted = name.trim();
  if (!wanted) return undefined;
  const exact = sessions.filter((session) => session.title.trim() === wanted);
  if (exact.length) return mostRecent(exact);
  const suffixed = sessions.filter((session) =>
    session.title.trim().startsWith(`${wanted} · `),
  );
  if (suffixed.length) return mostRecent(suffixed);
  return undefined;
}

/** A group as the sessions describe it: a name, and the members in it. */
export type GroupSeed = {
  name: string;
  members: { name: string; profile: string; sessionId: string }[];
};

/**
 * The groups the server knows about. A group is not a Hermes object: it lives
 * in the titles of its members' conversations, which is enough to rebuild it
 * after a restart.
 */
export function groupSeeds(
  perProfile: Map<string, HermesSession[]>,
): GroupSeed[] {
  const groups = new Map<string, Map<string, GroupSeed['members'][number]>>();
  for (const [profile, sessions] of perProfile) {
    for (const session of sessions) {
      const parsed = parseGroupSessionTitle(session.title);
      if (!parsed) continue;
      const members = groups.get(parsed.group) ?? new Map();
      const known = members.get(parsed.member);
      if (!known) {
        members.set(parsed.member, {
          name: parsed.member,
          profile,
          sessionId: session.id,
        });
      } else if (session.lastActive > known.lastActive) {
        // The same member name in two profiles: the conversation that ran last
        // is the one the group was talking on.
        members.set(parsed.member, {
          name: parsed.member,
          profile,
          sessionId: session.id,
        });
      }
      groups.set(parsed.group, members);
    }
  }
  return [...groups.entries()]
    .map(([name, members]) => ({ name, members: [...members.values()] }))
    .filter((group) => group.members.length > 0);
}

/** One stored line, with the fields the app cares about. */
type Row = Pick<HermesMessage, 'role' | 'content' | 'timestamp'>;

// A message that replaced another one carries the replaced text with it, so
// the bot does not lose the context. That note is the app's plumbing: it is
// not part of what the person said.
const CARRIED = /\n\n\(I also sent these while you were working;[^\n]*\)(?:\n- [^\n]*)*/g;

/**
 * A private conversation, read back. The tapback a bot left on the message it
 * answers is found again in the marker its answer still carries.
 */
export function privateTranscript(rows: Row[]): Message[] {
  const messages: Message[] = [];
  for (const row of rows) {
    const content = String(row.content ?? '').replace(CARRIED, '');
    if (row.role === 'user') {
      if (!content.trim()) continue;
      messages.push({
        id: `h-${row.timestamp}-${messages.length}`,
        role: 'user',
        text: content,
      });
      continue;
    }
    if (row.role !== 'assistant') continue;
    const parsed = extractReaction(content);
    // The protocol markers are plumbing, never copy.
    const body = stripSilentMarkers(parsed.text).trim();
    if (!body && !parsed.emoji) continue;
    if (body) {
      messages.push({
        id: `h-${row.timestamp}-${messages.length}`,
        role: 'assistant',
        text: body,
      });
    }
    if (parsed.emoji) {
      // The tapback belongs on the message the bot was answering.
      for (let index = messages.length - 1; index >= 0; index -= 1) {
        const target = messages[index];
        if (!target || target.role !== 'user') continue;
        messages[index] = { ...target, reaction: parsed.emoji };
        break;
      }
    }
  }
  return messages;
}

const TRANSCRIPT_MARKER = 'Conversation so far:\n';
const TURN_MARKER = '\n\nYou are @';

/** A group turn, as the app sends it: the room, the transcript, the cue. */
export type GroupWire = {
  /** The lines the room held before this turn. */
  transcript: string[];
  /** The member the turn was for. */
  speaker: string;
  /** What the member is told about the turn. */
  cue: string;
};

/** Reads a group turn back. Anything else is not one. */
export function parseGroupWire(content: string): GroupWire | null {
  if (!content.startsWith('[Group chat ')) return null;
  const start = content.indexOf(TRANSCRIPT_MARKER);
  if (start < 0) return null;
  const after = start + TRANSCRIPT_MARKER.length;
  const turn = content.indexOf(TURN_MARKER, after);
  if (turn < 0) return null;
  const tail = content.slice(turn + 2);
  const speaker = /^You are @(.+?)\.\s*/.exec(tail);
  if (!speaker) return null;
  const cue = tail.slice(speaker[0].length).split('\n')[0].trim();
  return {
    transcript: content.slice(after, turn).split('\n'),
    speaker: speaker[1].trim(),
    cue,
  };
}

/** A line of a group transcript, read back. */
type Line =
  | { kind: 'person'; text: string }
  | { kind: 'member'; name: string; text: string }
  | { kind: 'note'; text: string };

const PERSON_LINE = /^@You:\s?(.*)$/;
const MEMBER_LINE = /^@([^:]+):\s?(.*)$/;
const NOTE_LINE = /^\(note\)\s?(.*)$/;

/**
 * The lines of a transcript. A message that runs on several lines keeps them:
 * only the first line carries the speaker, the others continue it.
 */
export function readTranscript(lines: string[]): Line[] {
  const read: Line[] = [];
  for (const raw of lines) {
    const person = PERSON_LINE.exec(raw);
    if (person) {
      read.push({ kind: 'person', text: person[1] });
      continue;
    }
    const note = NOTE_LINE.exec(raw);
    if (note) {
      read.push({ kind: 'note', text: note[1] });
      continue;
    }
    const member = MEMBER_LINE.exec(raw);
    if (member) {
      read.push({ kind: 'member', name: member[1].trim(), text: member[2] });
      continue;
    }
    // A continuation of the line above.
    const last = read[read.length - 1];
    if (!last) continue;
    if (last.kind === 'person') last.text = `${last.text}\n${raw}`;
    else if (last.kind === 'member') last.text = `${last.text}\n${raw}`;
    else last.text = `${last.text}\n${raw}`;
  }
  return read;
}

type GroupEvent =
  | { kind: 'person'; ts: number; text: string }
  | { kind: 'member'; ts: number; member: GroupMember; raw: string; addressed: boolean };

/** A message that carries a face and a tapback. */
type Spoken = Extract<Message, { role: 'assistant' | 'user' }>;

/**
 * A group conversation, read back out of the members' sessions.
 *
 * A group keeps one session per member, and every member is told the same
 * room before it answers. The person speaks in those transcripts; the members
 * answer in their own sessions. Putting the two back together by their
 * timestamps rebuilds the conversation the room actually had.
 */
export function groupTranscript(
  members: GroupMember[],
  transcripts: Map<string, Row[]>,
): Message[] {
  const events: GroupEvent[] = [];
  // The person spoke in every member's transcript: the first mention is the
  // moment the line was sent.
  const personAt = new Map<string, number>();

  for (const member of members) {
    const rows = transcripts.get(member.id) ?? [];
    let wire: GroupWire | null = null;
    for (const row of rows) {
      const content = String(row.content ?? '');
      if (row.role === 'user') {
        const parsed = parseGroupWire(content);
        if (!parsed) continue;
        wire = parsed;
        for (const line of readTranscript(parsed.transcript)) {
          if (line.kind !== 'person') continue;
          if (personAt.has(line.text)) continue;
          personAt.set(line.text, row.timestamp);
        }
        continue;
      }
      if (row.role !== 'assistant') continue;
      const addressed = wire
        ? /mentioned you by name|addressed you directly/.test(wire.cue)
        : false;
      events.push({ kind: 'member', ts: row.timestamp, member, raw: content, addressed });
    }
  }

  for (const [text, ts] of personAt) {
    events.push({ kind: 'person', ts, text });
  }
  events.sort((left, right) => left.ts - right.ts);

  const messages: Message[] = [];
  const lastSpoken = (): Spoken | undefined => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.role === 'event') continue;
      return message;
    }
    return undefined;
  };

  for (const event of events) {
    if (event.kind === 'person') {
      messages.push({
        id: `hp-${event.ts}-${messages.length}`,
        role: 'user',
        text: event.text,
      });
      continue;
    }
    const turn = readGroupTurn(event.raw, members);
    const target = lastSpoken();
    if (turn.silent) {
      // Silence is a move, and it leaves a tapback: the app forces one, so a
      // member that sat this one out is acknowledged all the same.
      if (target) {
        const emoji = silentReaction(event.member.id, target.id);
        messages[messages.indexOf(target)] = {
          ...target,
          reactions: [...(target.reactions ?? []), { emoji, by: event.member.name }],
        };
      }
      if (event.addressed) {
        messages.push({
          id: `he-${event.ts}-${messages.length}`,
          role: 'event',
          text: `${event.member.name} stayed silent.`,
        });
      }
      continue;
    }
    if (turn.emoji && target) {
      const reactions = (target.reactions ?? []).filter(
        (reaction) => reaction.by !== event.member.name,
      );
      messages[messages.indexOf(target)] = {
        ...target,
        reactions: [...reactions, { emoji: turn.emoji, by: event.member.name }],
      };
    }
    if (turn.text) {
      messages.push({
        id: `hm-${event.ts}-${messages.length}`,
        role: 'assistant',
        text: turn.text,
        authorId: event.member.id,
        authorName: event.member.name,
        authorAvatar: event.member.avatar,
      });
    }
  }
  return messages;
}
