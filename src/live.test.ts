import { describe, expect, it } from 'vitest';
import { LIVE_MS, mergeTranscript, PROFILE_EVERY, sessionDigest } from './live';

function line(id: string, role: string, text: string) {
  return { id, role, text };
}

describe('the pace of a live window', () => {
  it('reads the conversations more often than it lists the bots', () => {
    expect(LIVE_MS).toBe(2500);
    expect(PROFILE_EVERY).toBeGreaterThan(1);
  });
});

describe('sessionDigest', () => {
  it('has nothing to say about a profile with no session', () => {
    expect(sessionDigest(undefined)).toBe('');
    expect(sessionDigest([])).toBe('');
  });

  it('moves when a session grows', () => {
    const session = {
      id: 's1',
      title: 'Bot',
      messageCount: 2,
      lastActive: 10,
      archived: false,
    };
    expect(sessionDigest([session])).not.toBe(
      sessionDigest([{ ...session, messageCount: 3 }]),
    );
    expect(sessionDigest([session])).not.toBe(
      sessionDigest([{ ...session, lastActive: 11 }]),
    );
    expect(sessionDigest([session])).not.toBe(
      sessionDigest([{ ...session, title: 'Other' }]),
    );
    expect(sessionDigest([session])).not.toBe(
      sessionDigest([{ ...session, archived: true }]),
    );
  });

  it('does not depend on the order the host lists them in', () => {
    const one = {
      id: 'a',
      title: 'A',
      messageCount: 1,
      lastActive: 1,
      archived: false,
    };
    const two = { ...one, id: 'b', title: 'B' };
    expect(sessionDigest([one, two])).toBe(sessionDigest([two, one]));
  });
});

describe('mergeTranscript', () => {
  it('leaves the room alone when the host has nothing', () => {
    expect(mergeTranscript([line('m-1', 'user', 'hi')], [])).toBeNull();
  });

  it('takes what the host holds when the room is empty', () => {
    const read = [line('h-1', 'user', 'hi')];
    expect(mergeTranscript([], read)).toBe(read);
  });

  it('says nothing changed when the lines are the same', () => {
    const read = [line('h-1', 'user', 'hi'), line('h-2', 'assistant', 'there')];
    expect(mergeTranscript(read, read)).toBeNull();
  });

  it('appends the lines that arrived from somewhere else', () => {
    const shown = [line('h-1', 'user', 'hi'), line('h-2', 'assistant', 'there')];
    const read = [...shown, line('h-3', 'user', 'and?'), line('h-4', 'assistant', 'yes')];
    expect(mergeTranscript(shown, read)).toEqual(read);
  });

  it('does not draw the window own message twice, and takes its host id', () => {
    const shown = [
      line('h-1', 'user', 'hi'),
      line('h-2', 'assistant', 'there'),
      line('m-9', 'user', 'listen'),
      line('a-9', 'assistant', 'I am'),
    ];
    const read = [
      line('h-1', 'user', 'hi'),
      line('h-2', 'assistant', 'there'),
      line('h-3', 'user', 'listen'),
      line('h-4', 'assistant', 'I am'),
    ];
    expect(mergeTranscript(shown, read)?.map((entry) => entry.id)).toEqual([
      'h-1',
      'h-2',
      'h-3',
      'h-4',
    ]);
  });

  it('does not take the next turn for the window own words', () => {
    // Two turns that say the same thing: the first one is the window's own,
    // the second one is another client's, and it must not be swallowed.
    const shown = [line('h-1', 'user', 'hi'), line('m-2', 'user', 'Test'), line('a-2', 'assistant', 'Rien')];
    const first = mergeTranscript(shown, [
      line('h-1', 'user', 'hi'),
      line('h-2', 'user', 'Test'),
      line('h-3', 'assistant', 'Rien'),
    ]);
    expect(first?.map((entry) => entry.id)).toEqual(['h-1', 'h-2', 'h-3']);

    const second = mergeTranscript(first ?? [], [
      line('h-1', 'user', 'hi'),
      line('h-2', 'user', 'Test'),
      line('h-3', 'assistant', 'Rien'),
      line('h-4', 'user', 'Test'),
      line('h-5', 'assistant', 'Autre'),
    ]);
    expect(second?.map((entry) => entry.id)).toEqual([
      'h-1',
      'h-2',
      'h-3',
      'h-4',
      'h-5',
    ]);
  });

  it('still appends what another client said after the window own turn', () => {
    const shown = [
      line('h-1', 'user', 'hi'),
      line('m-9', 'user', 'listen'),
      line('a-9', 'assistant', 'I am'),
    ];
    const read = [
      line('h-1', 'user', 'hi'),
      line('h-2', 'user', 'listen'),
      line('h-3', 'assistant', 'I am'),
      line('h-4', 'user', 'and again'),
    ];
    const merged = mergeTranscript(shown, read);
    expect(merged?.map((entry) => entry.id)).toEqual([
      'h-1',
      'h-2',
      'h-3',
      'h-4',
    ]);
  });

  it('keeps a note the window wrote itself', () => {
    const shown = [line('h-1', 'user', 'hi'), line('e-1', 'event', 'the turn stopped')];
    const read = [line('h-1', 'user', 'hi'), line('h-2', 'assistant', 'there')];
    const merged = mergeTranscript(shown, read);
    expect(merged?.map((entry) => entry.id)).toEqual(['h-1', 'e-1', 'h-2']);
  });

  it('replaces a line the host edited in place', () => {
    const shown = [line('h-1', 'user', 'hi'), line('h-2', 'assistant', 'ther')];
    const read = [line('h-1', 'user', 'hi'), line('h-2', 'assistant', 'there')];
    expect(mergeTranscript(shown, read)).toEqual(read);
  });

  it('does not take a different line for the window own', () => {
    const shown = [line('h-1', 'user', 'hi'), line('m-9', 'user', 'what I typed')];
    const read = [line('h-1', 'user', 'hi'), line('h-2', 'user', 'what was stored')];
    const merged = mergeTranscript(shown, read);
    expect(merged?.map((entry) => entry.id)).toEqual(['h-1', 'm-9', 'h-2']);
  });

  it('drops what the host no longer holds when nothing matches', () => {
    const shown = [line('m-1', 'user', 'hi')];
    const read = [line('h-1', 'user', 'hello')];
    expect(mergeTranscript(shown, read)).toEqual(read);
  });
});
