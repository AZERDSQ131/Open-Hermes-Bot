// The one that walks a theatre: what it plays, when it falls asleep with the
// quiet, and when a click loans it another face. What is asserted is the
// attribute the story is written with — the mood, the face, nothing else.

import { fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MOOD_QUIET_MS, moodExpression } from '../moods';
import { MoodBloub } from './MoodBloub';

type MoodProps = Parameters<typeof MoodBloub>[0];

function stage(mood: MoodProps['mood'], props: Partial<MoodProps> = {}) {
  const view = render(
    <MoodBloub
      color="#3f6fd1"
      shape="cercle"
      mood={mood}
      size={40}
      {...props}
    />,
  );
  return {
    face: () =>
      view.container.querySelector<HTMLSpanElement>('.mood-bloub'),
    rerender: (next: MoodProps['mood']) =>
      view.rerender(
      <MoodBloub
        color="#3f6fd1"
        shape="cercle"
        mood={next}
        size={40}
        {...props}
      />,
    ),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('MoodBloub', () => {
  it('plays the mood it is given, and wears the mood face', () => {
    for (const mood of [
      'idle',
      'running',
      'interaction',
      'completed',
      'sleepy',
    ] as const) {
      const view = stage(mood);
      const face = view.face();
      expect(face?.dataset.mood).toBe(mood);
      expect(face?.dataset.face).toBe(moodExpression(mood));
    }
  });

  it('the quiet face dozes off after the two minutes of the plugin', async () => {
    vi.useFakeTimers();
    const view = stage('idle');
    expect(view.face()?.dataset.mood).toBe('idle');
    await vi.advanceTimersByTimeAsync(MOOD_QUIET_MS);
    expect(view.face()?.dataset.mood).toBe('sleepy');
  });

  it('a working mood never dozes, however long the quiet', async () => {
    vi.useFakeTimers();
    const view = stage('running');
    await vi.advanceTimersByTimeAsync(MOOD_QUIET_MS * 3);
    expect(view.face()?.dataset.mood).toBe('running');
  });

  it('the doze is left behind with the mood, and earned again', async () => {
    vi.useFakeTimers();
    const view = stage('idle');
    await vi.advanceTimersByTimeAsync(MOOD_QUIET_MS);
    expect(view.face()?.dataset.mood).toBe('sleepy');
    view.rerender('running');
    expect(view.face()?.dataset.mood).toBe('running');
    view.rerender('idle');
    expect(view.face()?.dataset.mood).toBe('idle');
    await vi.advanceTimersByTimeAsync(MOOD_QUIET_MS);
    expect(view.face()?.dataset.mood).toBe('sleepy');
  });

  it('a click loans another face, and the next mood takes it back', () => {
    const view = stage('idle', { interactive: true });
    const worn = view.face()?.dataset.face;
    const touched = view.face();
    if (touched) fireEvent.click(touched);
    const borrowed = view.face()?.dataset.face;
    expect(borrowed).toBeTruthy();
    expect(borrowed).not.toBe(worn);
    view.rerender('running');
    expect(view.face()?.dataset.face).toBe(moodExpression('running'));
  });

  it('a face that is not for touching does not answer to a click', () => {
    const view = stage('idle');
    const before = view.face()?.dataset.face;
    const touched = view.face();
    if (touched) fireEvent.click(touched);
    expect(view.face()?.dataset.face).toBe(before);
    expect(view.face()?.dataset.face).toBe(moodExpression('idle'));
  });
});
