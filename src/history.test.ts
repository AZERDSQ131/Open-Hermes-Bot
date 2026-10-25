import { describe, expect, it } from 'vitest';
import {
  PAST_PREVIEW,
  UNTITLED,
  groupPastSessions,
  pastTitle,
  relativeDay,
  shortDay,
  simulatedPastSessions,
  simulatedReply,
  simulatedTranscript,
  viewPastConversations,
} from './history';
import type { PastSession } from './history';
import type { Thread } from './data';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 9, 25, 12);

function past(
  id: string,
  title: string,
  lastActive: number,
  profile?: string,
): PastSession {
  return { id, title, profile, messageCount: 3, lastActive };
}

function bot(id: string, name: string, profile?: string): Thread {
  return {
    id,
    name,
    profile,
    avatar: { color: '#123456', shape: 'galet', variant: 'neutral' },
    preview: '',
    time: '',
    chatTime: '',
    messages: [],
  };
}

describe('pastTitle', () => {
  it('reads a session the CLI never named as a sentence, not a blank row', () => {
    expect(pastTitle(past('a', '   ', 0))).toBe(UNTITLED);
  });

  it('keeps the title it was given, trimmed', () => {
    expect(pastTitle(past('a', '  Bridge audit  ', 0))).toBe('Bridge audit');
  });
});

describe('relativeDay', () => {
  it('says now while the minute lasts', () => {
    expect(relativeDay(NOW, NOW - 30_000)).toBe('now');
  });

  it('counts the minutes, then the hours, then the days', () => {
    expect(relativeDay(NOW, NOW - 5 * 60_000)).toBe('5 m');
    expect(relativeDay(NOW, NOW - 3 * HOUR)).toBe('3 h');
    expect(relativeDay(NOW, NOW - 2 * DAY)).toBe('2 d');
  });

  it('counts the weeks, then gives the date', () => {
    expect(relativeDay(NOW, NOW - 16 * DAY)).toBe('2 w');
    expect(relativeDay(NOW, NOW - 40 * DAY)).toBe('15 Sep');
  });

  it('never counts backwards when the host clock runs ahead', () => {
    expect(relativeDay(NOW, NOW + HOUR)).toBe('now');
  });
});

describe('shortDay', () => {
  it('spells the day out for the notice a conversation carries', () => {
    expect(shortDay(Date.UTC(2026, 8, 12, 12))).toBe('12 Sep');
  });
});

describe('groupPastSessions', () => {
  const threads = [
    bot('bot:chief', 'Chief of Staff'),
    bot('bot:bob', 'Bob', 'bob'),
    {
      id: 'group:one',
      name: 'Group · one · Bob',
      members: [],
      avatar: { kind: 'group' as const, members: [] },
      preview: '',
      time: '',
      chatTime: '',
      messages: [],
    },
  ];

  it('puts a conversation under the bot that owns its profile', () => {
    const groups = groupPastSessions(
      [past('a', 'Mine', NOW, 'bob'), past('b', 'Theirs', NOW)],
      threads,
    );
    expect(groups.map((group) => [group.key, group.name])).toEqual([
      ['default', 'Chief of Staff'],
      ['bob', 'Bob'],
    ]);
    expect(groups[1].avatar).toEqual({ color: '#123456', shape: 'galet', variant: 'neutral' });
    expect(groups[1].sessions.map((session) => session.title)).toEqual(['Mine']);
  });

  it('puts the primary bot first, then the one spoken to last', () => {
    const groups = groupPastSessions(
      [
        past('old', 'Old', NOW - 9 * DAY, 'bob'),
        past('new', 'New', NOW - HOUR, 'alice'),
        past('chief', 'Chief', NOW - 30 * DAY),
      ],
      threads,
    );
    expect(groups.map((group) => group.key)).toEqual(['default', 'alice', 'bob']);
  });

  it('sorts the conversations of a bot by the last word', () => {
    const groups = groupPastSessions(
      [past('old', 'Old', NOW - 9 * DAY), past('new', 'New', NOW - HOUR)],
      threads,
    );
    expect(groups[0].sessions.map((session) => session.id)).toEqual([
      'new',
      'old',
    ]);
  });

  it('gives a profile with no bot its own hue rather than hiding the row', () => {
    const groups = groupPastSessions([past('a', 'Elsewhere', NOW, 'zed')], threads);
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe('zed');
    expect(groups[0].avatar.shape).toBe('cercle');
    expect(groups[0].avatar.color).toMatch(/^hsl\(/);
  });

  it('names the primary bot when no thread calls it by name', () => {
    const groups = groupPastSessions([past('a', 'Untouched', NOW)], []);
    expect(groups[0].name).toBe('Chief of Staff');
  });

  it('holds no session for a group: a group is rebuilt, not stored', () => {
    const groups = groupPastSessions([past('a', 'Mine', NOW, 'bob')], threads);
    expect(groups.every((group) => group.profile !== 'group:one')).toBe(true);
    expect(groups[0].profile).toBe('bob');
  });
});

describe('viewPastConversations', () => {
  const groups = groupPastSessions(
    [
      past('one', 'Bridge audit', NOW - HOUR),
      past('two', 'Tunnel refactor', NOW - DAY),
      past('three', 'Release checklist', NOW - 2 * DAY),
      past('four', 'VPS migration', NOW - 3 * DAY),
      past('five', 'Bob notes', NOW - 4 * DAY, 'bob'),
    ],
    [bot('bot:chief', 'Chief of Staff'), bot('bot:bob', 'Bob', 'bob')],
  );

  it('folds a group at the preview length and counts what is left', () => {
    const view = viewPastConversations(groups);
    expect(PAST_PREVIEW).toBe(3);
    expect(view.total).toBe(5);
    expect(view.groups[0].sessions).toHaveLength(3);
    // Four conversations under the primary bot, three shown; the other bot
    // holds one, and none of it is hidden.
    expect(view.hidden).toBe(1);
  });

  it('opens the whole history when asked', () => {
    const view = viewPastConversations(groups, { all: true });
    expect(view.hidden).toBe(0);
    expect(view.groups[0].sessions).toHaveLength(4);
  });

  it('searches the title, and nothing else', () => {
    const view = viewPastConversations(groups, { query: '  tunnel ' });
    expect(view.total).toBe(1);
    expect(view.groups).toHaveLength(1);
    expect(view.groups[0].sessions[0].title).toBe('Tunnel refactor');
  });

  it('shows every match of a search, not the fold', () => {
    const view = viewPastConversations(groups, { query: 'r' });
    // Every title of the primary bot holds an 'r': a question gets all four
    // while the fold would have shown three, and nothing is left counted but
    // unseen.
    expect(view.total).toBe(4);
    expect(view.groups[0].sessions).toHaveLength(4);
    expect(view.hidden).toBe(0);
  });

  it('drops a group whose conversations all fell out of the search', () => {
    const view = viewPastConversations(groups, { query: 'bob' });
    expect(view.groups).toHaveLength(1);
    expect(view.groups[0].key).toBe('bob');
  });

  it('has nothing to show when nothing matches', () => {
    const view = viewPastConversations(groups, { query: 'zzz' });
    expect(view).toEqual({ groups: [], total: 0, hidden: 0 });
  });
});

describe('the simulation', () => {
  const threads = [
    bot('bot:chief', 'Chief of Staff'),
    bot('bot:bob', 'Bob', 'bob'),
  ];

  it('gives every bot something to show, and one bot more than the fold', () => {
    const sessions = simulatedPastSessions(threads, NOW);
    expect(sessions.map((session) => session.profile)).toContain('bob');
    expect(sessions.filter((session) => !session.profile)).toHaveLength(4);
    expect(simulatedPastSessions(threads, NOW)).toEqual(sessions);
  });

  it('keeps an unnamed session, so the row has something to say', () => {
    const sessions = simulatedPastSessions(threads, NOW);
    expect(sessions.some((session) => !session.title)).toBe(true);
  });

  it('holds nothing when there is no bot to hold it', () => {
    expect(simulatedPastSessions([], NOW)).toEqual([]);
  });

  it('writes a transcript of the shape the window already draws', () => {
    const session = past('a', 'Bridge audit', NOW);
    const lines = simulatedTranscript(session);
    expect(lines[0].role).toBe('event');
    expect(lines.some((line) => line.role === 'user')).toBe(true);
    expect(lines.some((line) => line.role === 'assistant')).toBe(true);
    expect(lines.map((line) => line.id)).toEqual([
      'a:event',
      'a:opening',
      'a:answer',
    ]);
  });

  it('says out loud that the answer did not reach the host', () => {
    const reply = simulatedReply(past('a', 'Bridge audit', NOW));
    expect(reply.role).toBe('assistant');
    expect(reply.role === 'assistant' && reply.text).toContain('simulated');
  });
});
