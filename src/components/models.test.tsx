import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ModelPicker } from './ModelPicker';
import { ModelsSettings } from './ModelsSettings';
import { ModelPrefsProvider } from '../modelPrefs';
import type { HermesModel } from '../hermes';

const models: HermesModel[] = [
  { model: 'muse', provider: 'opencode-go', providerName: 'OpenCode', current: true },
  { model: 'deepseek', provider: 'opencode-go', providerName: 'OpenCode', current: false },
];

function withBridge(overrides: Record<string, unknown> = {}) {
  (window as unknown as { hermes: unknown }).hermes = {
    models: vi.fn(async () => ({
      ok: true,
      current: 'muse',
      currentProvider: 'opencode-go',
      models,
    })),
    profiles: vi.fn(async () => ({
      ok: true,
      profiles: [
        { name: 'bob', title: 'Bob', color: '#e8483f' },
        { name: 'default', title: 'Chief of Staff' },
      ],
    })),
    prefs: vi.fn(async () => ({ ok: true, prefs: {} })),
    savePrefs: vi.fn(async () => ({ ok: true })),
    ...overrides,
  };
}

/** Lets the promises the app makes on mount settle before the assertions. */
async function settle() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('the model chip', () => {
  it('shows the model that is picked', async () => {
    withBridge();
    render(
      <ModelPrefsProvider>
        <ModelPicker value="muse" provider="opencode-go" label="muse" onChange={() => undefined} />
      </ModelPrefsProvider>,
    );
    await settle();
    expect(screen.getByText('muse')).toBeTruthy();
  });

  it('shows the bot default when nothing is picked', async () => {
    withBridge();
    render(
      <ModelPrefsProvider>
        <ModelPicker fallbackLabel="muse" onChange={() => undefined} />
      </ModelPrefsProvider>,
    );
    await settle();
    expect(screen.getByText('muse')).toBeTruthy();
  });

  it('says nothing about a model when the tunnel is down', async () => {
    withBridge();
    render(
      <ModelPrefsProvider>
        <ModelPicker connected={false} onChange={() => undefined} />
      </ModelPrefsProvider>,
    );
    await settle();
    expect(screen.getByText('Model')).toBeTruthy();
  });

  it('lists the models when it is opened', async () => {
    withBridge();
    render(
      <ModelPrefsProvider>
        <ModelPicker onChange={() => undefined} />
      </ModelPrefsProvider>,
    );
    await userEvent.click(screen.getByText('Model'));
    await waitFor(() => expect(screen.getAllByText('muse').length).toBeGreaterThan(0));
    expect(screen.getByText('deepseek')).toBeTruthy();
  });

  it('picks the model that was chosen', async () => {
    withBridge();
    const onChange = vi.fn();
    render(
      <ModelPrefsProvider>
        <ModelPicker onChange={onChange} />
      </ModelPrefsProvider>,
    );
    await userEvent.click(screen.getByText('Model'));
    await waitFor(() => expect(screen.getByText('deepseek')).toBeTruthy());
    await userEvent.click(screen.getByText('deepseek'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'deepseek' }),
    );
  });

  it('says what went wrong when the models cannot be listed', async () => {
    withBridge({
      models: vi.fn(async () => ({ ok: false, error: 'no tunnel' })),
    });
    render(
      <ModelPrefsProvider>
        <ModelPicker onChange={() => undefined} />
      </ModelPrefsProvider>,
    );
    await userEvent.click(screen.getByText('Model'));
    await waitFor(() => expect(screen.getByText('no tunnel')).toBeTruthy());
  });

  it('does not open when it is disabled', async () => {
    withBridge();
    render(
      <ModelPrefsProvider>
        <ModelPicker disabled onChange={() => undefined} />
      </ModelPrefsProvider>,
    );
    await userEvent.click(screen.getByText('Model'));
    expect(screen.queryByText('deepseek')).toBeNull();
  });
});

describe('the models in the settings', () => {
  it('lists what the server offers', async () => {
    withBridge();
    render(
      <ModelPrefsProvider>
        <ModelsSettings connected />
      </ModelPrefsProvider>,
    );
    await waitFor(() => expect(screen.getAllByText('muse').length).toBeGreaterThan(0));
    expect(screen.getAllByText('Bob').length).toBeGreaterThan(0);
  });

  it('says when the server cannot be reached', async () => {
    withBridge({
      models: vi.fn(async () => ({ ok: false, error: 'no tunnel' })),
    });
    render(
      <ModelPrefsProvider>
        <ModelsSettings connected />
      </ModelPrefsProvider>,
    );
    await waitFor(() => expect(screen.getByText('no tunnel')).toBeTruthy());
  });

  it('says when the bots cannot be listed', async () => {
    withBridge({
      profiles: vi.fn(async () => ({ ok: false, error: 'no bots' })),
    });
    render(
      <ModelPrefsProvider>
        <ModelsSettings connected />
      </ModelPrefsProvider>,
    );
    await waitFor(() => expect(screen.getByText('no bots')).toBeTruthy());
  });

  it('says that the list comes from disk when the gateway is silent', async () => {
    withBridge({
      profiles: vi.fn(async () => ({
        ok: true,
        source: 'disk',
        warning: 'the gateway is not answering',
        profiles: [{ name: 'bob', title: 'Bob' }],
      })),
    });
    render(
      <ModelPrefsProvider>
        <ModelsSettings connected />
      </ModelPrefsProvider>,
    );
    await waitFor(() =>
      expect(screen.getByText('the gateway is not answering')).toBeTruthy(),
    );
  });

  it('lists the bots of the server', async () => {
    withBridge();
    render(
      <ModelPrefsProvider>
        <ModelsSettings connected />
      </ModelPrefsProvider>,
    );
    await waitFor(() => expect(screen.getAllByText('Bob').length).toBeGreaterThan(0));
    expect(screen.getAllByText('Chief of Staff').length).toBeGreaterThan(0);
  });
});
