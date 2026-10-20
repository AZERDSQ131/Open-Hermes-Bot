import { describe, expect, it } from 'vitest';
import {
  findSession,
  groupSeeds,
  groupSessionTitle,
  groupTranscript,
  parseGroupSessionTitle,
  parseGroupWire,
  privateTranscript,
  readTranscript,
} from './conversations';
import type { GroupMember } from './data';
import type { HermesMessage, HermesSession } from './hermes';

function session(title: string, id: string, lastActive = 0): HermesSession {
  return { id, title, messageCount: 0, lastActive, archived: false };
}

function row(role: string, content: string, timestamp: number): HermesMessage {
  return { role, content, timestamp };
}

const member = (id: string, name: string, profile: string): GroupMember => ({
  id,
  name,
  profile,
  avatar: { color: '#888888', shape: 'cercle', variant: 'neutral' },
});

describe('session titles', () => {
  it('names a group conversation after the group and the member', () => {
    expect(groupSessionTitle('Test', 'Bob')).toBe('Group · Test · Bob');
  });

  it('reads a group title back', () => {
    expect(parseGroupSessionTitle('Group · Test · Bob')).toEqual({
      group: 'Test',
      member: 'Bob',
    });
  });

  it('keeps a separator inside the group name', () => {
    expect(parseGroupSessionTitle('Group · Sales · EU · Bob')).toEqual({
      group: 'Sales · EU',
      member: 'Bob',
    });
  });

  it('leaves a private title alone', () => {
    expect(parseGroupSessionTitle('Chief of Staff')).toBeNull();
  });
});

describe('finding the conversation of a thread', () => {
  it('takes the session under the exact name', () => {
    const sessions = [session('Bob', 'a', 10), session('Bob', 'b', 20)];
    expect(findSession('Bob', sessions)?.id).toBe('b');
  });

  it('takes a suffixed title when the name was taken already', () => {
    const sessions = [session('Bob · 12345', 'a', 10)];
    expect(findSession('Bob', sessions)?.id).toBe('a');
  });

  it('finds nothing when there is no such conversation', () => {
    expect(findSession('Bob', [session('Alice', 'a')])).toBeUndefined();
  });
});

describe('groups rebuilt from the server', () => {
  it('collects the members of a group from their titles', () => {
    const perProfile = new Map<string, HermesSession[]>([
      [
        'default',
        [session('Group · Test · Chief of Staff', 'a', 5)],
      ],
      [
        'bob',
        [session('Group · Test · Bob', 'b', 7), session('Bob', 'c', 9)],
      ],
    ]);
    const seeds = groupSeeds(perProfile);
    expect(seeds).toHaveLength(1);
    expect(seeds[0].name).toBe('Test');
    expect(seeds[0].members.map((entry) => entry.profile).sort()).toEqual([
      'bob',
      'default',
    ]);
  });

  it('leaves private conversations out of it', () => {
    const perProfile = new Map<string, HermesSession[]>([
      ['default', [session('Chief of Staff', 'a')]],
    ]);
    expect(groupSeeds(perProfile)).toEqual([]);
  });
});

describe('a private conversation read back', () => {
  it('keeps the lines in order', () => {
    const messages = privateTranscript([
      row('user', 'Hello', 1),
      row('assistant', 'Hi there', 2),
      row('tool', '{"output": "noise"}', 3),
      row('user', 'And now?', 4),
      row('assistant', 'Now this', 5),
    ]);
    expect(messages.map((message) => [message.role, message.text])).toEqual([
      ['user', 'Hello'],
      ['assistant', 'Hi there'],
      ['user', 'And now?'],
      ['assistant', 'Now this'],
    ]);
  });

  it('finds the tapback a bot left on the message it answered', () => {
    const messages = privateTranscript([
      row('user', 'Hello', 1),
      row('assistant', '[[react:👍]]', 2),
    ]);
    expect(messages).toHaveLength(1);
    expect((messages[0] as { reaction?: string }).reaction).toBe('👍');
  });

  it('drops a silence, which is nothing to show', () => {
    const messages = privateTranscript([
      row('user', 'Hello', 1),
      row('assistant', '[[silent]]', 2),
    ]);
    expect(messages.map((message) => message.text)).toEqual(['Hello']);
  });
});

describe('a group turn read back', () => {
  it('reads the transcript and the cue', () => {
    const wire = parseGroupWire(
      [
        '[Group chat “Test” — members: @Chief of Staff, @Bob, and the person (shown as @You).]',
        '',
        'Conversation so far:',
        '@You: Hello',
        '',
        'You are @Bob. @Chief of Staff mentioned you by name. You have the floor now.',
        'It is your turn.',
      ].join('\n'),
    );
    expect(wire).not.toBeNull();
    expect(wire?.speaker).toBe('Bob');
    expect(wire?.cue).toContain('mentioned you by name');
    expect(readTranscript(wire?.transcript ?? [])).toEqual([
      { kind: 'person', text: 'Hello' },
    ]);
  });

  it('is not a group turn when it is not one', () => {
    expect(parseGroupWire('just a message')).toBeNull();
  });
});

describe('a group conversation read back', () => {
  const chief = member('bot:chief', 'Chief of Staff', 'default');
  const bob = member('bot:bob', 'Bob', 'bob');

  const wire = (transcript: string[], speaker: string, cue: string) =>
    [
      '[Group chat “Test” — members: @Chief of Staff, @Bob, and the person (shown as @You).]',
      '',
      'Conversation so far:',
      ...transcript,
      '',
      `You are @${speaker}. ${cue}`,
      'It is your turn.',
    ].join('\n');

  it('puts the person and the members back in order', () => {
    const transcripts = new Map<string, HermesMessage[]>([
      [
        'bot:chief',
        [
          row('user', wire(['@You: Hello'], 'Chief of Staff', 'The last line is new in the group.'), 10),
          row('assistant', 'Good to see you', 20),
        ],
      ],
      [
        'bot:bob',
        [
          row(
            'user',
            wire(
              [
                '@You: Hello',
                '@Chief of Staff: Good to see you',
              ],
              'Bob',
              'The last line is new in the group.',
            ),
            11,
          ),
          row('assistant', 'Hello yourself', 21),
        ],
      ],
    ]);
    const messages = groupTranscript([chief, bob], transcripts);
    expect(
      messages.map((message) => [
        message.role,
        message.text,
        (message as { authorName?: string }).authorName,
      ]),
    ).toEqual([
      ['user', 'Hello', undefined],
      ['assistant', 'Good to see you', 'Chief of Staff'],
      ['assistant', 'Hello yourself', 'Bob'],
    ]);
  });

  it('shows a silence as a tapback, and as a note when it was named', () => {
    const transcripts = new Map<string, HermesMessage[]>([
      [
        'bot:chief',
        [
          row('user', wire(['@You: Hello'], 'Chief of Staff', 'The last line is new in the group.'), 10),
          row('assistant', '[[silent]]', 20),
        ],
      ],
      [
        'bot:bob',
        [
          row(
            'user',
            wire(['@You: Hello'], 'Bob', '@Chief of Staff mentioned you by name. You have the floor now.'),
            11,
          ),
          row('assistant', 'Hi', 21),
        ],
      ],
    ]);
    const messages = groupTranscript([chief, bob], transcripts);
    const hello = messages.find((message) => message.text === 'Hello');
    const reactions = (hello as { reactions?: { emoji: string; by?: string }[] })
      ?.reactions;
    expect(reactions?.[0]?.by).toBe('Chief of Staff');
    expect(reactions?.[0]?.emoji).toBeTruthy();
  });
});
