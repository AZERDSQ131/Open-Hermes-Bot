import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UpdateButton } from './UpdateButton';
import type { HermesUpdateEvent } from '../hermes';

type Listeners = ((event: HermesUpdateEvent) => void)[];

function withBridge(
  overrides: Record<string, unknown> = {},
  listeners: Listeners = [],
) {
  (window as unknown as { hermes: unknown }).hermes = {
    checkForUpdates: vi.fn(async () => ({
      ok: true,
      state: 'current',
      version: '1.0.0',
    })),
    installUpdate: vi.fn(async () => ({ ok: true })),
    onUpdate: vi.fn((callback: (event: HermesUpdateEvent) => void) => {
      listeners.push(callback);
      return () => undefined;
    }),
    ...overrides,
  };
  return listeners;
}

describe('the small place beside the settings', () => {
  it('shows nothing when there is no app around it', () => {
    const { container } = render(<UpdateButton />);
    expect(container.firstChild).toBe(null);
    expect(window.hermes).toBeUndefined();
  });

  it('asks for an update when it is pressed', async () => {
    withBridge();
    render(<UpdateButton />);
    const entry = screen.getByRole('button', {
      name: 'Check for an update',
    });
    await userEvent.click(entry);
    expect(window.hermes?.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it('says what it is doing, and keeps itself from being pressed', async () => {
    const listeners: Listeners = [];
    withBridge({}, listeners);
    render(<UpdateButton />);
    act(() => listeners[0]({ state: 'checking' }));
    const entry = await screen.findByRole('button', {
      name: 'Looking for an update…',
    });
    expect(entry).toHaveProperty('disabled', true);
  });

  it('moves with the download, ring by ring', async () => {
    const listeners: Listeners = [];
    withBridge({}, listeners);
    render(<UpdateButton />);
    act(() =>
      listeners[0]({ state: 'downloading', version: '1.1.0', percent: 42 }),
    );
    expect(
      await screen.findByRole('button', {
        name: 'Downloading the update — 42%',
      }),
    ).toBeTruthy();
    expect(document.querySelector('.update-entry-ring')).toBeTruthy();
    expect(
      document.querySelector('.update-entry-ring circle:last-child'),
    ).toHaveProperty(
      'style',
      expect.objectContaining({ strokeDashoffset: expect.anything() }),
    );
  });

  it('tells it softly when a version was seen', async () => {
    const listeners: Listeners = [];
    withBridge({}, listeners);
    render(<UpdateButton />);
    act(() => listeners[0]({ state: 'available', version: '1.1.0' }));
    const entry = await screen.findByRole('button', {
      name: 'An update was found',
    });
    expect(entry.className).toContain('is-coming');
    expect(entry).toHaveProperty('disabled', true);
  });

  it('tells it loud when the new version is on the disk, and lets it in', async () => {
    const listeners: Listeners = [];
    withBridge({}, listeners);
    render(<UpdateButton />);
    act(() => listeners[0]({ state: 'ready', version: '1.1.0' }));
    const entry = await screen.findByRole('button', {
      name: 'The update is ready: the app restarts by itself',
    });
    expect(entry.className).toContain('is-here');
    await waitFor(() => {
      expect(window.hermes?.installUpdate).toHaveBeenCalledTimes(1);
    });
  });

  it('says when the look went wrong, and stands ready again', async () => {
    const listeners: Listeners = [];
    withBridge({}, listeners);
    render(<UpdateButton />);
    act(() => listeners[0]({ state: 'error', message: 'no network' }));
    const entry = await screen.findByRole('button', {
      name: 'The look for an update failed',
    });
    expect(entry.className).toContain('is-trouble');
    expect(entry).toHaveProperty('disabled', false);
  });

  it('stays quiet when the app is up to date, ready to be asked again', async () => {
    const listeners: Listeners = [];
    withBridge({}, listeners);
    render(<UpdateButton />);
    act(() => listeners[0]({ state: 'current', version: '1.0.0' }));
    const entry = await screen.findByRole('button', {
      name: 'The app is up to date',
    });
    expect(entry.className).toContain('is-none');
    expect(entry).toHaveProperty('disabled', false);
  });
});
