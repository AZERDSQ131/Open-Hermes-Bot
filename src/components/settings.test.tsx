import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsView } from './SettingsView';
import { ModelPrefsProvider } from '../modelPrefs';
import type { HermesStatus } from '../hermes';

const connected: HermesStatus = { state: 'connected', version: '0.21.5' };

function withBridge(overrides: Record<string, unknown> = {}) {
  (window as unknown as { hermes: unknown }).hermes = {
    getSettings: vi.fn(async () => ({
      sshHost: 'my-host',
      apiPort: 8642,
      localPort: 18742,
      autoConnect: true,
      hasKey: true,
    })),
    saveSettings: vi.fn(async () => ({ ok: true })),
    test: vi.fn(async () => ({ state: 'connected', version: '0.21.5' })),
    disconnect: vi.fn(async () => ({ state: 'disconnected' })),
    connect: vi.fn(async () => ({ state: 'connected' })),
    importKey: vi.fn(async () => ({ ok: true, keyLength: 64 })),
    status: vi.fn(async () => connected),
    models: vi.fn(async () => ({ ok: true, models: [] })),
    profiles: vi.fn(async () => ({ ok: true, profiles: [] })),
    prefs: vi.fn(async () => ({ ok: true, prefs: {} })),
    savePrefs: vi.fn(async () => ({ ok: true })),
    ...overrides,
  };
}

function renderSettings(
  status: HermesStatus = connected,
  onStatusChange = vi.fn(),
  onClose = vi.fn(),
) {
  return render(
    <ModelPrefsProvider>
      <SettingsView
        status={status}
        onClose={onClose}
        onStatusChange={onStatusChange}
      />
    </ModelPrefsProvider>,
  );
}

describe('the settings', () => {
  it('show what the connection is', () => {
    withBridge();
    renderSettings();
    expect(screen.getByText(/Connected/)).toBeTruthy();
  });

  it('say when there is no connection', () => {
    withBridge();
    renderSettings({ state: 'disconnected' });
    expect(screen.getByText(/Not connected/)).toBeTruthy();
  });

  it('show the host and the port that are stored', async () => {
    withBridge();
    renderSettings();
    await waitFor(() =>
      expect(screen.getByDisplayValue('my-host')).toBeTruthy(),
    );
  });

  it('say when the connection failed', () => {
    withBridge();
    renderSettings({ state: 'error', message: 'the key was refused' });
    expect(screen.getByText(/the key was refused/)).toBeTruthy();
  });

  it('test the connection with what is written', async () => {
    const bridge = {
      getSettings: vi.fn(async () => ({
        sshHost: 'my-host',
        apiPort: 8642,
        localPort: 18742,
        autoConnect: true,
        hasKey: true,
      })),
      test: vi.fn(async () => ({ state: 'connected', version: '0.21.5' })),
      saveSettings: vi.fn(async () => ({ ok: true })),
      disconnect: vi.fn(),
      connect: vi.fn(),
      importKey: vi.fn(),
      models: vi.fn(async () => ({ ok: true, models: [] })),
      profiles: vi.fn(async () => ({ ok: true, profiles: [] })),
      prefs: vi.fn(async () => ({ ok: true, prefs: {} })),
      savePrefs: vi.fn(async () => ({ ok: true })),
    };
    (window as unknown as { hermes: unknown }).hermes = bridge;
    renderSettings();
    await waitFor(() =>
      expect(screen.getByDisplayValue('my-host')).toBeTruthy(),
    );
    await userEvent.click(screen.getByText('Test connection'));
    await waitFor(() => expect(bridge.test).toHaveBeenCalled());
  });

  it('import the key from the host', async () => {
    const bridge = {
      getSettings: vi.fn(async () => ({
        sshHost: 'my-host',
        apiPort: 8642,
        localPort: 18742,
        autoConnect: true,
        hasKey: false,
      })),
      importKey: vi.fn(async () => ({ ok: true, keyLength: 64 })),
      saveSettings: vi.fn(async () => ({ ok: true })),
      test: vi.fn(),
      disconnect: vi.fn(),
      connect: vi.fn(),
      models: vi.fn(async () => ({ ok: true, models: [] })),
      profiles: vi.fn(async () => ({ ok: true, profiles: [] })),
      prefs: vi.fn(async () => ({ ok: true, prefs: {} })),
      savePrefs: vi.fn(async () => ({ ok: true })),
    };
    (window as unknown as { hermes: unknown }).hermes = bridge;
    renderSettings();
    await waitFor(() =>
      expect(screen.getByText('Import from my-host')).toBeTruthy(),
    );
    await userEvent.click(screen.getByText('Import from my-host'));
    await waitFor(() => expect(bridge.importKey).toHaveBeenCalled());
  });

  it('disconnect when the person asks', async () => {
    const bridge = {
      getSettings: vi.fn(async () => ({
        sshHost: 'my-host',
        apiPort: 8642,
        localPort: 18742,
        autoConnect: true,
        hasKey: true,
      })),
      disconnect: vi.fn(async () => ({ state: 'disconnected' })),
      connect: vi.fn(),
      saveSettings: vi.fn(async () => ({ ok: true })),
      test: vi.fn(),
      importKey: vi.fn(),
      models: vi.fn(async () => ({ ok: true, models: [] })),
      profiles: vi.fn(async () => ({ ok: true, profiles: [] })),
      prefs: vi.fn(async () => ({ ok: true, prefs: {} })),
      savePrefs: vi.fn(async () => ({ ok: true })),
    };
    (window as unknown as { hermes: unknown }).hermes = bridge;
    renderSettings();
    await waitFor(() => expect(screen.getByText('Disconnect')).toBeTruthy());
    await userEvent.click(screen.getByText('Disconnect'));
    await waitFor(() => expect(bridge.disconnect).toHaveBeenCalled());
  });

  it('connect again when the person asks', async () => {
    const bridge = {
      getSettings: vi.fn(async () => ({
        sshHost: 'my-host',
        apiPort: 8642,
        localPort: 18742,
        autoConnect: true,
        hasKey: true,
      })),
      connect: vi.fn(async () => ({ state: 'connected' })),
      disconnect: vi.fn(),
      saveSettings: vi.fn(async () => ({ ok: true })),
      test: vi.fn(),
      importKey: vi.fn(),
      models: vi.fn(async () => ({ ok: true, models: [] })),
      profiles: vi.fn(async () => ({ ok: true, profiles: [] })),
      prefs: vi.fn(async () => ({ ok: true, prefs: {} })),
      savePrefs: vi.fn(async () => ({ ok: true })),
    };
    (window as unknown as { hermes: unknown }).hermes = bridge;
    renderSettings({ state: 'disconnected' });
    await waitFor(() => expect(screen.getByText('Connect')).toBeTruthy());
    await userEvent.click(screen.getByText('Connect'));
    await waitFor(() => expect(bridge.connect).toHaveBeenCalled());
  });

  it('remove the key that is stored', async () => {
    const bridge = {
      getSettings: vi.fn(async () => ({
        sshHost: 'my-host',
        apiPort: 8642,
        localPort: 18742,
        autoConnect: true,
        hasKey: true,
      })),
      saveSettings: vi.fn(async () => ({ ok: true })),
      connect: vi.fn(),
      disconnect: vi.fn(),
      test: vi.fn(),
      importKey: vi.fn(),
      models: vi.fn(async () => ({ ok: true, models: [] })),
      profiles: vi.fn(async () => ({ ok: true, profiles: [] })),
      prefs: vi.fn(async () => ({ ok: true, prefs: {} })),
      savePrefs: vi.fn(async () => ({ ok: true })),
    };
    (window as unknown as { hermes: unknown }).hermes = bridge;
    renderSettings();
    await waitFor(() => expect(screen.getByText('Remove stored key')).toBeTruthy());
    await userEvent.click(screen.getByText('Remove stored key'));
    await waitFor(() =>
      expect(bridge.saveSettings).toHaveBeenCalledWith(
        expect.objectContaining({ clearKey: true }),
      ),
    );
  });

  it('go back to the conversation', async () => {
    withBridge();
    const onClose = vi.fn();
    renderSettings(connected, vi.fn(), onClose);
    await userEvent.click(screen.getByLabelText('Back to Grok Bot'));
    expect(onClose).toHaveBeenCalled();
  });

  it('show the models when they are asked for', async () => {
    withBridge();
    renderSettings();
    await userEvent.click(screen.getByRole('button', { name: 'Models' }));
    expect(screen.getByText(/One default per bot/)).toBeTruthy();
  });
});
