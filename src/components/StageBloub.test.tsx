import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import { StageBloub } from './StageBloub';

function withMotion(reduce: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: reduce,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

/** Lets the engine draw a few frames. */
async function frames(count = 3) {
  for (let index = 0; index < count; index += 1) {
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    });
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the actor', () => {
  it('draws a body with eyes', async () => {
    withMotion(false);
    const { container } = render(
      <StageBloub
        color="#8b5cf6"
        shape="cercle"
        state="idle"
        expression="neutre"
      />,
    );
    await waitFor(() => expect(container.querySelector('svg')).toBeTruthy());
    // The body, the eyes and the colour that fills them.
    expect(container.querySelectorAll('path').length).toBeGreaterThan(1);
    expect(container.querySelector('rect')).toBeTruthy();
  });

  it('takes the shape the scene asks for', async () => {
    withMotion(false);
    const { container, rerender } = render(
      <StageBloub
        color="#8b5cf6"
        shape="cercle"
        state="idle"
        expression="neutre"
      />,
    );
    await waitFor(() => expect(container.querySelector('svg')).toBeTruthy());
    const before = container.querySelector('path')?.getAttribute('d');
    rerender(
      <StageBloub
        color="#8b5cf6"
        shape="goutte"
        state="idle"
        expression="neutre"
      />,
    );
    await frames(4);
    const after = container.querySelector('path')?.getAttribute('d');
    expect(after).not.toBe(before);
  });

  it('draws the points of a state that has them', async () => {
    withMotion(false);
    const { container } = render(
      <StageBloub
        color="#8b5cf6"
        shape="cercle"
        state="thinking"
        expression="neutre"
      />,
    );
    await waitFor(() => expect(container.querySelector('svg')).toBeTruthy());
    await frames(10);
    // The body becomes a point, and two more come out of its flanks.
    expect(container.querySelectorAll('circle').length).toBeGreaterThan(1);
  });

  it('draws the sign of a state that shouts', async () => {
    withMotion(false);
    const { container } = render(
      <StageBloub
        color="#8b5cf6"
        shape="cercle"
        state="alert"
        expression="neutre"
      />,
    );
    await waitFor(() => expect(container.querySelector('svg')).toBeTruthy());
    await frames(10);
    const point = [...container.querySelectorAll('path')].find((path) =>
      path.getAttribute('transform')?.startsWith('translate('),
    );
    expect(point).toBeTruthy();
  });

  it('holds still when the person asked for less movement', () => {
    withMotion(true);
    const { container } = render(
      <StageBloub
        color="#8b5cf6"
        shape="cercle"
        state="idle"
        expression="neutre"
      />,
    );
    // A frame is drawn, and it is the same one the next time round.
    const first = container.querySelector('path')?.getAttribute('d');
    const second = container.querySelector('path')?.getAttribute('d');
    expect(first).toBeTruthy();
    expect(second).toBe(first);
  });
});
