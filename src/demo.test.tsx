import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { ModelPrefsProvider } from './modelPrefs';
import { createDemoBridge } from './demo';
import type { HermesBridge } from './hermes';

async function renderDemo() {
  const bridge = createDemoBridge();
  (window as unknown as { hermes: HermesBridge }).hermes = bridge;
  const view = render(
    <ModelPrefsProvider>
      <App />
    </ModelPrefsProvider>,
  );
  await act(async () => {
    await Promise.resolve();
  });
  return view;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the window with a host that is not there', () => {
  it('shows the bots, the groups and the rooms the demo made', async () => {
    await renderDemo();
    expect(await screen.findByText('Atelier')).toBeTruthy();
    expect(await screen.findByText('Nova')).toBeTruthy();
    expect(await screen.findByText('Le trio')).toBeTruthy();
  });

  it('has a history of conversations nobody opened here', async () => {
    await renderDemo();
    await userEvent.click(
      await screen.findByRole('button', { name: /Past conversations/ }),
    );
    expect(await screen.findByText('Bridge audit')).toBeTruthy();
    expect(screen.getByText('Sprint planning')).toBeTruthy();
    // The row the host archived, and the group that is rebuilt elsewhere,
    // stay out of it.
    expect(screen.queryByText('Vieille affaire')).toBeNull();
    expect(screen.queryByText('Group · Le trio · Nova')).toBeNull();
  });

  it('reads a conversation and answers a turn, all in memory', async () => {
    await renderDemo();
    await userEvent.click(
      await screen.findByRole('button', { name: /Past conversations/ }),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /Bridge audit/ }),
    );
    await waitFor(() =>
      expect(screen.getByText(/On reprend « Bridge audit »/)).toBeTruthy(),
    );
  });
});
