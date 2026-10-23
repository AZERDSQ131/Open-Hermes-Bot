// The one that walks a theatre: what it plays, when it falls asleep with the
// quiet, and when a click loans it another face. What is asserted is the
// attribute the story is written with — the mood, the face, nothing else.

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { moodExpression } from '../moods';
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
  vi.restoreAllMocks();
});

/** A quiet that fits a test: the two minutes of the plugin, shrunk. */
const DREAM_MS = 40;

/** How long wake-ups take when nobody pushes the clock. */
const WAKE_TIMEOUT = 1000;

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

  it('the quiet face dozes off after the quiet it is given', async () => {
    const view = stage('idle', { quietMs: DREAM_MS });
    expect(view.face()?.dataset.mood).toBe('idle');
    await waitFor(() => expect(view.face()?.dataset.mood).toBe('sleepy'), {
      timeout: WAKE_TIMEOUT,
    });
  });

  it('a working mood never dozes, however long the quiet', async () => {
    const view = stage('running', { quietMs: DREAM_MS });
    expect(view.face()?.dataset.mood).toBe('running');
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(view.face()?.dataset.mood).toBe('running');
  });

  it('the doze is left behind with the mood, and earned again', async () => {
    const view = stage('idle', { quietMs: DREAM_MS });
    await waitFor(() => expect(view.face()?.dataset.mood).toBe('sleepy'), {
      timeout: WAKE_TIMEOUT,
    });
    view.rerender('running');
    expect(view.face()?.dataset.mood).toBe('running');
    view.rerender('idle');
    expect(view.face()?.dataset.mood).toBe('idle');
    await waitFor(() => expect(view.face()?.dataset.mood).toBe('sleepy'), {
      timeout: WAKE_TIMEOUT,
    });
  });

  it('a click loans another face, and the next mood takes it back', () => {
    const view = stage('idle', { interactive: true });
    // A face for touching is a button, and says so to a keyboard.
    expect(
      screen.getByRole('button', { name: 'Change its face' }),
    ).toBeTruthy();
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
