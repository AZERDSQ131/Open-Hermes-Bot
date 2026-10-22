import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UpdatesSettings } from './UpdatesSettings';
import type { HermesUpdateEvent } from '../hermes';

type Listeners = ((event: HermesUpdateEvent) => void)[];

/** What the page of the project has published, the way GitHub keeps it. */
const ROWS = [
  {
    tag_name: 'v1.1.0',
    name: 'The one that takes care of itself',
    published_at: '2025-10-20T12:00:00Z',
    prerelease: false,
    draft: false,
    html_url:
      'https://github.com/AZERDSQ131/Open-Hermes-Bot/releases/tag/v1.1.0',
  },
  {
    tag_name: 'v1.0.1',
    name: 'A rehearsal',
    published_at: '2025-10-02T12:00:00Z',
    prerelease: true,
    draft: false,
    html_url:
      'https://github.com/AZERDSQ131/Open-Hermes-Bot/releases/tag/v1.0.1',
  },
  {
    tag_name: 'v1.0.0',
    name: 'First of its name',
    published_at: '2025-09-30T12:00:00Z',
    prerelease: false,
    draft: false,
    html_url:
      'https://github.com/AZERDSQ131/Open-Hermes-Bot/releases/tag/v1.0.0',
  },
];

const PAGE = 'https://github.com/AZERDSQ131/Open-Hermes-Bot/releases';

function withBridge(
  overrides: Record<string, unknown> = {},
  listeners: Listeners = [],
) {
  (window as unknown as { hermes: unknown }).hermes = {
    updateInfo: vi.fn(async () => ({ version: '1.0.0', supported: true })),
    checkForUpdates: vi.fn(async () => ({
      ok: true,
      state: 'current',
      version: '1.0.0',
    })),
    installUpdate: vi.fn(async () => ({ ok: true })),
    updateHistory: vi.fn(async () => ({ ok: true, rows: ROWS, page: PAGE })),
    openRelease: vi.fn(async () => ({ ok: true })),
    onUpdate: vi.fn((callback: (event: HermesUpdateEvent) => void) => {
      listeners.push(callback);
      return () => undefined;
    }),
    ...overrides,
  };
  return listeners;
}

describe('the page of updates', () => {
  it('says the version the app is running', async () => {
    withBridge();
    render(<UpdatesSettings />);
    expect(await screen.findByText('Version 1.0.0')).toBeTruthy();
  });

  it('offers to look for an update', async () => {
    withBridge();
    render(<UpdatesSettings />);
    expect(
      await screen.findByRole('button', { name: /Check for updates/ }),
    ).toBeTruthy();
  });

  it('cannot look when it is not installed', async () => {
    withBridge({
      updateInfo: vi.fn(async () => ({ version: '1.0.0', supported: false })),
    });
    render(<UpdatesSettings />);
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Check for updates/ }),
      ).toHaveProperty('disabled', true);
    });
    expect(screen.getByText(/installed app/)).toBeTruthy();
  });

  it('says so when it is not the desktop app', () => {
    render(<UpdatesSettings />);
    expect(
      screen.getByText(/only available inside the desktop app/),
    ).toBeTruthy();
  });

  it('looks when the button is pressed', async () => {
    const listeners = withBridge();
    render(<UpdatesSettings />);
    const button = await screen.findByRole('button', {
      name: /Check for updates/,
    });
    await userEvent.click(button);
    expect(window.hermes?.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(listeners.length).toBeGreaterThan(0);
  });

  it('says it is looking', async () => {
    const listeners: Listeners = [];
    withBridge(
      {
        checkForUpdates: vi.fn(
          () =>
            new Promise(() => {
              // The check never ends: the person is watching it.
            }),
        ),
      },
      listeners,
    );
    render(<UpdatesSettings />);
    const button = await screen.findByRole('button', {
      name: /Check for updates/,
    });
    await userEvent.click(button);
    expect(await screen.findByRole('button', { name: /Checking/ })).toBeTruthy();
  });

  it('says how far the download has come', async () => {
    const listeners: Listeners = [];
    withBridge({}, listeners);
    render(<UpdatesSettings />);
    await screen.findByRole('button', { name: /Check for updates/ });
    act(() =>
      listeners[0]({ state: 'downloading', version: '1.1.0', percent: 42 }),
    );
    expect(
      await screen.findByRole('button', { name: /Downloading… 42%/ }),
    ).toBeTruthy();
    expect(screen.getByText(/Downloading 1.1.0/)).toBeTruthy();
  });

  it('says the app is up to date', async () => {
    const listeners: Listeners = [];
    withBridge({}, listeners);
    render(<UpdatesSettings />);
    await screen.findByRole('button', { name: /Check for updates/ });
    act(() => listeners[0]({ state: 'current', version: '1.0.0' }));
    expect(await screen.findByRole('button', { name: /Check again/ })).toBeTruthy();
    expect(screen.getByText(/up to date/)).toBeTruthy();
  });

  it('says why the check failed', async () => {
    const listeners: Listeners = [];
    withBridge({}, listeners);
    render(<UpdatesSettings />);
    await screen.findByRole('button', { name: /Check for updates/ });
    act(() => listeners[0]({ state: 'error', message: 'no network' }));
    expect(await screen.findByRole('button', { name: /Try again/ })).toBeTruthy();
    expect(screen.getByText('no network')).toBeTruthy();
  });

  it('lets the new version take over when it is ready', async () => {
    const listeners: Listeners = [];
    withBridge({}, listeners);
    render(<UpdatesSettings />);
    await screen.findByRole('button', { name: /Check for updates/ });
    act(() => listeners[0]({ state: 'ready', version: '1.1.0' }));
    expect(await screen.findByRole('button', { name: /Restarting/ })).toBeTruthy();
    await waitFor(() => {
      expect(window.hermes?.installUpdate).toHaveBeenCalledTimes(1);
    });
  });

  it('does not let the new version take over while it downloads', async () => {
    const listeners: Listeners = [];
    withBridge({}, listeners);
    render(<UpdatesSettings />);
    await screen.findByRole('button', { name: /Check for updates/ });
    act(() =>
      listeners[0]({ state: 'downloading', version: '1.1.0', percent: 10 }),
    );
    await screen.findByRole('button', { name: /Downloading/ });
    expect(window.hermes?.installUpdate).not.toHaveBeenCalled();
  });

  it('says when the app could not leave', async () => {
    const listeners: Listeners = [];
    withBridge(
      {
        installUpdate: vi.fn(async () => {
          throw new Error('the app cannot leave');
        }),
      },
      listeners,
    );
    render(<UpdatesSettings />);
    await screen.findByRole('button', { name: /Check for updates/ });
    act(() => listeners[0]({ state: 'ready', version: '1.1.0' }));
    expect(await screen.findByText('the app cannot leave')).toBeTruthy();
  });

  it('stops listening when it is gone', async () => {
    const off = vi.fn();
    withBridge({
      onUpdate: vi.fn((callback: (event: HermesUpdateEvent) => void) => {
        callback;
        return off;
      }),
    });
    const { unmount } = render(<UpdatesSettings />);
    unmount();
    expect(off).toHaveBeenCalledTimes(1);
  });
});

describe('what the page of the project has published', () => {
  it('reads the history GitHub kept', async () => {
    withBridge();
    render(<UpdatesSettings />);
    expect(
      await screen.findByText('The one that takes care of itself'),
    ).toBeTruthy();
    expect(screen.getByText('Oct 20')).toBeTruthy();
    expect(screen.getByText('Oct 2')).toBeTruthy();
    expect(screen.getByText('prerelease')).toBeTruthy();
  });

  it('opens a row where its release lives', async () => {
    withBridge();
    render(<UpdatesSettings />);
    const row = await screen.findByRole('button', { name: /v1\.1\.0/ });
    await userEvent.click(row);
    expect(window.hermes?.openRelease).toHaveBeenCalledWith(
      'https://github.com/AZERDSQ131/Open-Hermes-Bot/releases/tag/v1.1.0',
    );
  });

  it('opens the page of the releases from its foot', async () => {
    withBridge();
    render(<UpdatesSettings />);
    const open = await screen.findByRole('button', {
      name: /Open the releases page/,
    });
    await userEvent.click(open);
    expect(window.hermes?.openRelease).toHaveBeenCalledWith(PAGE);
  });

  it('shows the release it is being given, apart from the history', async () => {
    const listeners: Listeners = [];
    withBridge({}, listeners);
    render(<UpdatesSettings />);
    await screen.findByRole('button', { name: /Check for updates/ });
    act(() =>
      listeners[0]({
        state: 'downloading',
        version: '1.1.0',
        percent: 12,
        released: '2025-10-20T12:00:00Z',
      }),
    );
    await screen.findByRole('button', { name: /Downloading/ });
    expect(await screen.findByText('v1.1.0')).toBeTruthy();
    // The one being carried in is not two rows of the same list.
    expect(screen.getAllByText('v1.1.0')).toHaveLength(1);
  });

  it('says so when GitHub did not answer', async () => {
    withBridge({
      updateHistory: vi.fn(async () => {
        throw new Error('offline');
      }),
    });
    render(<UpdatesSettings />);
    expect(await screen.findByText(/GitHub did not answer/)).toBeTruthy();
  });

  it('says so when the page has nothing on it', async () => {
    withBridge({
      updateHistory: vi.fn(async () => ({ ok: true, rows: [], page: '' })),
    });
    render(<UpdatesSettings />);
    expect(await screen.findByText(/nothing on it yet/)).toBeTruthy();
  });
});
