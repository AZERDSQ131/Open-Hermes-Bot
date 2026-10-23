// The theatres: the scores, the faces, and what a thread or an update reads
// as. The rules are short on purpose — a mood that needs explaining cannot
// be seen at the foot of a sidebar.

import { describe, expect, it } from 'vitest';
import { initialUpdateStatus, type UpdateState } from './updates';
import {
  moodExpression,
  moodIsPlayable,
  moodSpan,
  moodSteps,
  threadMood,
  updateMood,
} from './moods';
describe('the moods', () => {
  it('each mood carries a face and a score that the engine can play', () => {
    for (const mood of [
      'idle',
      'running',
      'interaction',
      'completed',
      'sleepy',
    ] as const) {
      expect(moodSteps(mood).length).toBeGreaterThan(0);
      expect(moodExpression(mood)).toBeTruthy();
      expect(moodIsPlayable(mood)).toBe(true);
      expect(moodSpan(mood)).toBeGreaterThan(0);
    }
  });

  it('quietness includes the transformation: the idle score turns the shape', () => {
    const steps = moodSteps('idle').map((step) => step.state);
    expect(steps).toEqual(['idle', 'wink', 'hexagon', 'idle']);
  });

  it('the sleepy theatre is a doze, and that is all of it', () => {
    expect(moodSteps('sleepy')).toEqual([
      { state: 'sleep', duration: 2400 },
    ]);
  });
});

describe('a thread read as a mood', () => {
  it('a bot that is not served yet asks for the look, not the comet', () => {
    expect(threadMood({ pending: true })).toBe('interaction');
    expect(threadMood({ serveFailed: true })).toBe('interaction');
  });

  it('a turn in flight runs the comet, whatever is streaming', () => {
    expect(threadMood({ thinking: true })).toBe('running');
    expect(threadMood({ streaming: 'words' })).toBe('running');
    expect(threadMood({ tool: 'bash' })).toBe('running');
  });

  it('an unread answer celebrates; a quiet thread keeps still', () => {
    expect(threadMood({ unread: true })).toBe('completed');
    expect(threadMood({})).toBe('idle');
  });

  it('the waiting bot outranks the working one and the unread one', () => {
    expect(
      threadMood({ pending: true, streaming: 'words', unread: true }),
    ).toBe('interaction');
  });
});

describe('an update read as a mood', () => {
  it('the look and the download run; the seen version asks; the arrival celebrates', () => {
    const at = (state: UpdateState) => ({
      ...initialUpdateStatus(),
      state,
    });
    expect(updateMood(at('checking'))).toBe('running');
    expect(updateMood(at('downloading'))).toBe('running');
    expect(updateMood(at('available'))).toBe('interaction');
    expect(updateMood(at('ready'))).toBe('completed');
    expect(updateMood(initialUpdateStatus())).toBe('idle');
  });
});
