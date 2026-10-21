import { describe, expect, it } from 'vitest';
import {
  cleanProtocol,
  formatTranscript,
  groupInstructions,
  groupTurnMessage,
  MAX_GROUP_LINES,
  MAX_GROUP_WAVES,
  MAX_MEMBER_LINES,
  mentionPattern,
  mentionsIn,
  readGroupTurn,
  SILENT_MARKER,
  silentReaction,
  splitMentions,
  stripSilentMarkers,
} from './group';
import type { GroupMember, Message } from './data';

const chief: GroupMember = {
  id: 'bot:chief',
  name: 'Chief of Staff',
  profile: 'default',
  avatar: { color: '#8b5cf6', shape: 'cercle', variant: 'neutral' },
};

const bob: GroupMember = {
  id: 'bot:bob',
  name: 'Bob',
  profile: 'bob',
  avatar: { color: '#e8483f', shape: 'cercle', variant: 'neutral' },
};

const crew = [chief, bob];

describe('who a line names', () => {
  it('matches the longest name first', () => {
    const pattern = mentionPattern(['Chief', 'Chief of Staff']);
    expect('@Chief of Staff'.match(pattern)?.[0]).toBe('@Chief of Staff');
  });

  it('does not match a name inside a longer word', () => {
    const pattern = mentionPattern(['Sam']);
    expect('@Sam'.match(pattern)).not.toBeNull();
    expect('@Samuel'.match(pattern)).toBeNull();
  });

  it('matches nothing when the roster is empty', () => {
    expect('anyone'.match(mentionPattern([]))).toBeNull();
  });

  it('ignores empty names and repeats', () => {
    const pattern = mentionPattern(['Bob', '  ', 'Bob']);
    expect(pattern.source).toContain('Bob');
    expect(pattern.source).not.toContain('|)');
  });

  it('finds the members a line names', () => {
    const found = mentionsIn('Hey @Bob, and @Chief of Staff too', crew);
    expect(found.map((member) => member.name)).toEqual([
      'Chief of Staff',
      'Bob',
    ]);
  });

  it('finds nobody when the name is not on the roster', () => {
    expect(mentionsIn('hello @Nobody', crew)).toEqual([]);
  });

  it('keeps the roster order', () => {
    const found = mentionsIn('@Bob @Chief of Staff', crew);
    expect(found.map((member) => member.name)).toEqual([
      'Chief of Staff',
      'Bob',
    ]);
  });
});

describe('a line cut into pieces', () => {
  it('separates the mentions from the rest', () => {
    const segments = splitMentions('hey @Bob, listen', crew);
    expect(segments).toEqual([
      { text: 'hey ', mention: false },
      { text: '@Bob', mention: true },
      { text: ', listen', mention: false },
    ]);
  });

  it('keeps a line with no mention whole', () => {
    expect(splitMentions('just talking', crew)).toEqual([
      { text: 'just talking', mention: false },
    ]);
  });

  it('keeps an empty line whole', () => {
    expect(splitMentions('', crew)).toEqual([{ text: '', mention: false }]);
  });
});

describe('the instructions every member gets', () => {
  it('names the room and the roster', () => {
    const prompt = groupInstructions('Test', crew);
    expect(prompt).toContain('Grok Bot group chat');
    expect(prompt).toContain('@Chief of Staff, @Bob');
    expect(prompt).toContain(SILENT_MARKER);
  });
});

describe('what one member sees for its turn', () => {
  const history: Message[] = [
    { id: '1', role: 'user', text: 'Hello' },
    { id: '2', role: 'assistant', text: 'Hi', authorId: bob.id, authorName: bob.name },
  ];

  it('shows the room, the transcript and the cue', () => {
    const turn = groupTurnMessage({
      groupName: 'Test',
      members: crew,
      speaker: bob,
      history,
    });
    expect(turn).toContain('[Group chat “Test”');
    expect(turn).toContain('@You: Hello');
    expect(turn).toContain('The last line is new in the group.');
  });

  it('says the person addressed the member', () => {
    const turn = groupTurnMessage({
      groupName: 'Test',
      members: crew,
      speaker: bob,
      history,
      addressed: true,
    });
    expect(turn).toContain('The person addressed you directly.');
  });

  it('says who handed the floor over', () => {
    const turn = groupTurnMessage({
      groupName: 'Test',
      members: crew,
      speaker: bob,
      history,
      mentionedBy: 'Chief of Staff',
    });
    expect(turn).toContain('@Chief of Staff mentioned you by name.');
  });
});

describe('the room as the model reads it', () => {
  it('attributes every line', () => {
    const text = formatTranscript([
      { id: '1', role: 'user', text: 'Hello' },
      { id: '2', role: 'assistant', text: 'Hi', authorId: bob.id, authorName: bob.name },
      { id: '3', role: 'event', text: 'Bob stayed silent.' },
      { id: '4', role: 'assistant', text: 'Yo' },
    ]);
    expect(text).toContain('@You: Hello');
    expect(text).toContain('@Bob: Hi');
    expect(text).toContain('(note) Bob stayed silent.');
    expect(text).toContain('Bot: Yo');
  });

  it('notes the tapbacks', () => {
    const text = formatTranscript([
      {
        id: '1',
        role: 'assistant',
        text: 'Hi',
        authorId: bob.id,
        authorName: bob.name,
        reactions: [{ emoji: '👍', by: 'Chief of Staff' }],
      },
    ]);
    expect(text).toContain('(Chief of Staff reacted 👍)');
  });

  it('says someone reacted when the tapback is not signed', () => {
    const text = formatTranscript([
      { id: '1', role: 'assistant', text: 'Hi', reactions: [{ emoji: '👍' }] },
    ]);
    expect(text).toContain('(someone reacted 👍)');
  });

  it('keeps only the last lines of a long room', () => {
    const many: Message[] = Array.from({ length: 40 }, (_, index) => ({
      id: String(index),
      role: 'user',
      text: `line ${index}`,
    }));
    const text = formatTranscript(many);
    expect(text).not.toContain('line 0\n');
    expect(text).toContain('line 39');
  });

  it('cuts a very long room to what fits', () => {
    const long: Message[] = Array.from({ length: 40 }, (_, index) => ({
      id: String(index),
      role: 'user',
      text: 'x'.repeat(400),
    }));
    const text = formatTranscript(long);
    expect(text.startsWith('…')).toBe(true);
    expect(text.length).toBeLessThan(6100);
  });
});

describe('reading a member’s answer', () => {
  it('reads a line', () => {
    const turn = readGroupTurn('A line for the room', crew);
    expect(turn).toEqual({
      silent: false,
      text: 'A line for the room',
      mentions: [],
    });
  });

  it('reads a tapback', () => {
    const turn = readGroupTurn('[[react:👍]]', crew);
    expect(turn.emoji).toBe('👍');
    expect(turn.text).toBe('');
  });

  it('reads a silence', () => {
    const turn = readGroupTurn(SILENT_MARKER, crew);
    expect(turn.silent).toBe(true);
    expect(turn.text).toBe('');
  });

  it('reads a silence that is not alone', () => {
    const turn = readGroupTurn(`${SILENT_MARKER} I have nothing to add`, crew);
    expect(turn.silent).toBe(true);
  });

  it('reads the members a line names', () => {
    const turn = readGroupTurn('hey @Bob', crew);
    expect(turn.mentions.map((member) => member.name)).toEqual(['Bob']);
  });

  it('reads an empty answer as a silence', () => {
    expect(readGroupTurn('   ', crew).silent).toBe(true);
  });
});

describe('the protocol markers', () => {
  it('takes the silence marker out of a line', () => {
    expect(stripSilentMarkers(`a${SILENT_MARKER}b`)).toBe('ab');
  });

  it('takes a half-written marker out too', () => {
    expect(stripSilentMarkers('the answer is [[si')).not.toContain('[[');
  });

  it('takes the whole protocol out of a line', () => {
    expect(cleanProtocol('[[react:👍]] done')).toBe('done');
    expect(cleanProtocol(`[[${'react:👍'}]]`)).toBe('');
    expect(cleanProtocol('half a marker [[')).toBe('half a marker');
  });
});

describe('the tapback a silent member leaves', () => {
  it('is one of the acknowledging ones', () => {
    for (let index = 0; index < 20; index += 1) {
      expect(['👍', '👀', '✅', '🙌']).toContain(
        silentReaction('bot:bob', `message-${index}`),
      );
    }
  });

  it('is the same for the same member and the same message', () => {
    expect(silentReaction('bot:bob', 'm1')).toBe(
      silentReaction('bot:bob', 'm1'),
    );
  });

  it('is not the same for another member', () => {
    const seen = new Set(
      Array.from({ length: 30 }, (_, index) =>
        silentReaction(`bot:${index}`, 'm1'),
      ),
    );
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('the limits of a group round', () => {
  it('stops the room from talking in circles', () => {
    expect(MAX_GROUP_LINES).toBeGreaterThan(0);
    expect(MAX_MEMBER_LINES).toBeGreaterThan(0);
    expect(MAX_GROUP_WAVES).toBeGreaterThan(0);
  });
});

describe('a line without an author', () => {
  it('is signed by the bot that wrote it', () => {
    const text = formatTranscript([
      { id: '1', role: 'assistant', text: 'Hi', authorId: 'bot:1' },
    ]);
    expect(text).toBe('@Bot: Hi');
  });
});
