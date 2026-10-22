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
      mode: 'ssh',
      configured: true,
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
    sshHosts: vi.fn(async () => ({
      ok: true,
      hosts: ['jetson', 'lab-box'],
    })),
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
  onRunSetup = vi.fn(),
) {
  return render(
    <ModelPrefsProvider>
      <SettingsView
        status={status}
        onClose={onClose}
        onStatusChange={onStatusChange}
        onRunSetup={onRunSetup}
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

  it('ask where Hermes runs', async () => {
    withBridge();
    renderSettings();
    await waitFor(() =>
      expect(screen.getByText('Where does Hermes run?')).toBeTruthy(),
    );
    expect(
      screen.getByRole('radio', { name: /This Mac/ }),
    ).toBeTruthy();
    expect(
      screen.getByRole('radio', { name: /Another machine/ }),
    ).toBeTruthy();
  });

  it('list the machines the SSH config names', async () => {
    const bridge = {
      getSettings: vi.fn(async () => ({
        mode: 'ssh',
        configured: true,
        sshHost: 'my-host',
        apiPort: 8642,
        localPort: 18742,
        autoConnect: true,
        hasKey: true,
      })),
      sshHosts: vi.fn(async () => ({
        ok: true,
        hosts: ['jetson', 'lab-box'],
      })),
      saveSettings: vi.fn(async () => ({ ok: true })),
      test: vi.fn(),
      disconnect: vi.fn(),
      connect: vi.fn(),
      importKey: vi.fn(),
    };
    (window as unknown as { hermes: unknown }).hermes = bridge;
    renderSettings();
    expect(await screen.findByRole('button', { name: /jetson/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /lab-box/ })).toBeTruthy();
    expect(bridge.sshHosts).toHaveBeenCalled();
  });

  it('connect to a saved host with one click', async () => {
    const bridge = {
      getSettings: vi.fn(async () => ({
        mode: 'ssh',
        configured: true,
        sshHost: 'my-host',
        apiPort: 8642,
        localPort: 18742,
        autoConnect: true,
        hasKey: false,
      })),
      sshHosts: vi.fn(async () => ({ ok: true, hosts: ['jetson', 'lab-box'] })),
      importKey: vi.fn(async () => ({ ok: true, keyLength: 64 })),
      saveSettings: vi.fn(async () => ({ ok: true })),
      test: vi.fn(),
      disconnect: vi.fn(),
      connect: vi.fn(async () => ({ state: 'connected' })),
      models: vi.fn(async () => ({ ok: true, models: [] })),
      profiles: vi.fn(async () => ({ ok: true, profiles: [] })),
      prefs: vi.fn(async () => ({ ok: true, prefs: {} })),
      savePrefs: vi.fn(async () => ({ ok: true })),
    };
    (window as unknown as { hermes: unknown }).hermes = bridge;
    renderSettings();
    await userEvent.click(
      await screen.findByRole('button', { name: /jetson/ }),
    );
    // The key read from the machine, the connection written down and
    // opened: all of it for the price of a click.
    expect(bridge.importKey).toHaveBeenCalledWith({
      mode: 'ssh',
      sshHost: 'jetson',
    });
    await waitFor(() => expect(bridge.saveSettings).toHaveBeenCalled());
    expect(bridge.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'ssh', sshHost: 'jetson' }),
    );
    expect(bridge.connect).toHaveBeenCalled();
  });

  it('ask for the key when the saved host has none to give', async () => {
    const bridge = {
      getSettings: vi.fn(async () => ({
        mode: 'ssh',
        configured: true,
        sshHost: 'my-host',
        apiPort: 8642,
        localPort: 18742,
        autoConnect: true,
        hasKey: false,
      })),
      sshHosts: vi.fn(async () => ({ ok: true, hosts: ['jetson'] })),
      importKey: vi.fn(async () => ({
        ok: false,
        error: 'API_SERVER_KEY not found in the remote ~/.hermes/.env',
      })),
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
    await userEvent.click(
      await screen.findByRole('button', { name: /jetson/ }),
    );
    expect(
      await screen.findByText(/API_SERVER_KEY not found/),
    ).toBeTruthy();
    // Nothing was written down: the click only asked for the key.
    expect(bridge.saveSettings).not.toHaveBeenCalled();
  });

  it('say when no host is saved', async () => {
    const bridge = {
      getSettings: vi.fn(async () => ({
        mode: 'ssh',
        configured: true,
        sshHost: 'my-host',
        apiPort: 8642,
        localPort: 18742,
        autoConnect: true,
        hasKey: true,
      })),
      sshHosts: vi.fn(async () => ({ ok: true, hosts: [] })),
      saveSettings: vi.fn(async () => ({ ok: true })),
      test: vi.fn(),
      disconnect: vi.fn(),
      connect: vi.fn(),
      importKey: vi.fn(),
    };
    (window as unknown as { hermes: unknown }).hermes = bridge;
    renderSettings();
    expect(
      await screen.findByText(/No host saved in your SSH config/),
    ).toBeTruthy();
  });

  it('ask for no host when Hermes runs on this machine', async () => {
    withBridge({
      getSettings: vi.fn(async () => ({
        mode: 'local',
        configured: true,
        sshHost: '',
        apiPort: 8642,
        localPort: 18742,
        autoConnect: true,
        hasKey: true,
      })),
    });
    renderSettings();
    await waitFor(() =>
      expect(screen.getByText('Where does Hermes run?')).toBeTruthy(),
    );
    expect(screen.queryByDisplayValue('my-host')).toBeNull();
    expect(screen.queryByText('SSH host')).toBeNull();
    expect(
      screen.getByRole('radio', { name: /This Mac/ }),
    ).toBeChecked();
  });

  it('read the key from the server when the person asks it to', async () => {
    const bridge = {
      getSettings: vi.fn(async () => ({
        mode: 'ssh',
        configured: true,
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
    expect(bridge.importKey).toHaveBeenCalledWith({
      mode: 'ssh',
      sshHost: 'my-host',
    });
  });

  it('save the mode the person chose', async () => {
    const bridge = {
      getSettings: vi.fn(async () => ({
        mode: 'ssh',
        configured: true,
        sshHost: 'my-host',
        apiPort: 8642,
        localPort: 18742,
        autoConnect: true,
        hasKey: true,
      })),
      saveSettings: vi.fn(async () => ({ ok: true })),
      test: vi.fn(),
      disconnect: vi.fn(),
      connect: vi.fn(async () => ({ state: 'connected' })),
      importKey: vi.fn(),
      models: vi.fn(async () => ({ ok: true, models: [] })),
      profiles: vi.fn(async () => ({ ok: true, profiles: [] })),
      prefs: vi.fn(async () => ({ ok: true, prefs: {} })),
      savePrefs: vi.fn(async () => ({ ok: true })),
    };
    (window as unknown as { hermes: unknown }).hermes = bridge;
    renderSettings();
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: /Another machine/ })).toBeChecked(),
    );
    await userEvent.click(screen.getByRole('radio', { name: /This Mac/ }));
    // A key is already stored: what is left of the key row is the way to
    // take it back.
    await waitFor(() =>
      expect(screen.getByText('Remove stored key')).toBeTruthy(),
    );
    expect(screen.queryByLabelText('API key')).toBeNull();
    await userEvent.click(screen.getByText(/Scan & connect/));
    await waitFor(() => expect(bridge.saveSettings).toHaveBeenCalled());
    expect(bridge.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'local' }),
    );
  });

  it('scan this Mac and connect with one click', async () => {
    const bridge = {
      getSettings: vi.fn(async () => ({
        mode: 'local',
        configured: true,
        sshHost: '',
        apiPort: 8642,
        localPort: 18742,
        autoConnect: true,
        hasKey: false,
      })),
      importKey: vi.fn(async () => ({ ok: true, keyLength: 64 })),
      saveSettings: vi.fn(async () => ({
        ok: true,
        settings: {
          mode: 'local',
          configured: true,
          sshHost: '',
          apiPort: 8642,
          localPort: 18742,
          autoConnect: true,
          hasKey: true,
        },
      })),
      test: vi.fn(),
      disconnect: vi.fn(),
      connect: vi.fn(async () => ({ state: 'connected' })),
      models: vi.fn(async () => ({ ok: true, models: [] })),
      profiles: vi.fn(async () => ({ ok: true, profiles: [] })),
      prefs: vi.fn(async () => ({ ok: true, prefs: {} })),
      savePrefs: vi.fn(async () => ({ ok: true })),
    };
    (window as unknown as { hermes: unknown }).hermes = bridge;
    renderSettings({ state: 'disconnected' });
    await waitFor(() =>
      expect(screen.getByText(/Scan & connect/)).toBeTruthy(),
    );
    // No key stored: the row says where the app will find one itself.
    expect(
      await screen.findByText(/API_SERVER_KEY from ~\/\.hermes\/\.env/),
    ).toBeTruthy();
    await userEvent.click(screen.getByText(/Scan & connect/));
    await waitFor(() => expect(bridge.connect).toHaveBeenCalled());
    // The whole scan: the key is read where it lives, then the connection
    // is written down and opened.
    expect(bridge.importKey).toHaveBeenCalledWith({ mode: 'local' });
    expect(bridge.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'local' }),
    );
  });

  it('say what has to be running when this Mac answers nothing', async () => {
    const bridge = {
      getSettings: vi.fn(async () => ({
        mode: 'local',
        configured: true,
        sshHost: '',
        apiPort: 8642,
        localPort: 18742,
        autoConnect: true,
        hasKey: true,
      })),
      importKey: vi.fn(),
      saveSettings: vi.fn(async () => ({ ok: true })),
      test: vi.fn(),
      disconnect: vi.fn(),
      connect: vi.fn(async () => ({
        state: 'error',
        message: 'Nothing is listening on that port',
      })),
      models: vi.fn(async () => ({ ok: true, models: [] })),
      profiles: vi.fn(async () => ({ ok: true, profiles: [] })),
      prefs: vi.fn(async () => ({ ok: true, prefs: {} })),
      savePrefs: vi.fn(async () => ({ ok: true })),
    };
    (window as unknown as { hermes: unknown }).hermes = bridge;
    renderSettings({ state: 'disconnected' });
    await waitFor(() =>
      expect(screen.getByText(/Scan & connect/)).toBeTruthy(),
    );
    await userEvent.click(screen.getByText(/Scan & connect/));
    expect(
      await screen.findByText(
        'No Hermes answered on 127.0.0.1:8642. Is it running?',
      ),
    ).toBeTruthy();
  });

  it('ask for the key when this Mac has none to read', async () => {
    const bridge = {
      getSettings: vi.fn(async () => ({
        mode: 'local',
        configured: true,
        sshHost: '',
        apiPort: 8642,
        localPort: 18742,
        autoConnect: true,
        hasKey: false,
      })),
      importKey: vi.fn(async () => ({
        ok: false,
        error: 'API_SERVER_KEY not found in ~/.hermes/.env',
      })),
      saveSettings: vi.fn(),
      test: vi.fn(),
      disconnect: vi.fn(),
      connect: vi.fn(),
      models: vi.fn(async () => ({ ok: true, models: [] })),
      profiles: vi.fn(async () => ({ ok: true, profiles: [] })),
      prefs: vi.fn(async () => ({ ok: true, prefs: {} })),
      savePrefs: vi.fn(async () => ({ ok: true })),
    };
    (window as unknown as { hermes: unknown }).hermes = bridge;
    renderSettings({ state: 'disconnected' });
    await waitFor(() =>
      expect(screen.getByText(/Scan & connect/)).toBeTruthy(),
    );
    await userEvent.click(screen.getByText(/Scan & connect/));
    expect(
      await screen.findByText(/API_SERVER_KEY not found/),
    ).toBeTruthy();
    // Nothing was written down: the scan was the only ask.
    expect(bridge.saveSettings).not.toHaveBeenCalled();
    // And nothing is asked to be pasted: one line, naming where the key
    // will be found once Hermes is set up.
    expect(screen.queryByLabelText('API key')).toBeNull();
    expect(
      screen.getByText(/API_SERVER_KEY from ~\/\.hermes\/\.env/),
    ).toBeTruthy();
  });

  it('say when the connection failed', () => {
    withBridge();
    renderSettings({ state: 'error', message: 'the key was refused' });
    expect(screen.getByText(/the key was refused/)).toBeTruthy();
  });

  it('test the connection with what is written', async () => {
    const bridge = {
      getSettings: vi.fn(async () => ({
        mode: 'ssh',
        configured: true,
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
        mode: 'ssh',
        configured: true,
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
        mode: 'ssh',
        configured: true,
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
        mode: 'ssh',
        configured: true,
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
        mode: 'ssh',
        configured: true,
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
    await userEvent.click(screen.getByLabelText('Back to Hermes Bot'));
    expect(onClose).toHaveBeenCalled();
  });

  it('show the models when they are asked for', async () => {
    withBridge();
    renderSettings();
    await userEvent.click(screen.getByRole('button', { name: 'Models' }));
    expect(screen.getByText(/One default per bot/)).toBeTruthy();
  });

  it('show the connectors when they are asked for', async () => {
    withBridge({
      connectors: vi.fn(async () => ({
        ok: true,
        available: true,
        catalog: [
          {
            slug: 'notion',
            name: 'Notion',
            description: 'Your pages',
            category: 'Documents',
            logo: 'https://logos.composio.dev/api/notion',
          },
        ],
        toolkit: [{ connector: 'notion', enabled: true }],
        accounts: [
          { connector: 'notion', status: 'active', label: 'jules@acme.com', active: true },
        ],
      })),
    });
    renderSettings();
    await userEvent.click(screen.getByRole('button', { name: 'Connectors' }));
    expect(
      screen.getByRole('heading', { name: 'Connectors' }),
    ).toBeTruthy();
    // The connectors of the host, with the name the host gives them.
    expect(await screen.findByText('Notion')).toBeTruthy();
    expect(screen.getByText('Your pages')).toBeTruthy();
    expect(screen.getByText('Connected')).toBeTruthy();
  });

  it('show the skills when they are asked for', async () => {
    withBridge({
      skills: vi.fn(async () => ({
        ok: true,
        skills: [
          { name: 'research', description: 'Look things up', enabled: true, provenance: 'hub' },
        ],
      })),
    });
    renderSettings();
    await userEvent.click(screen.getByRole('button', { name: 'Skills' }));
    expect(
      screen.getByRole('heading', { name: 'Skills' }),
    ).toBeTruthy();
    expect(await screen.findByText('research')).toBeTruthy();
  });

  it('say why the services are closed on the host', async () => {
    withBridge({
      connectors: vi.fn(async () => ({
        ok: true,
        available: false,
        catalog: [],
        toolkit: [],
        accounts: [],
        messages: ['The catalogue of the services is closed: portal authorization required'],
      })),
    });
    renderSettings();
    await userEvent.click(screen.getByRole('button', { name: 'Connectors' }));
    // The words of the host, and the way out.
    expect(
      await screen.findByText(/portal authorization required/),
    ).toBeTruthy();
    expect(screen.getByText(/hermes auth add nous/)).toBeTruthy();
  });

  it('read the host in the middle while the connectors load', async () => {
    withBridge({
      connectors: vi.fn(() => new Promise(() => undefined)),
    });
    renderSettings();
    await userEvent.click(screen.getByRole('button', { name: 'Connectors' }));
    expect(
      await screen.findByRole('heading', { name: 'Connectors' }),
    ).toBeTruthy();
    // The header meta and the centered body say the same thing.
    expect(screen.getAllByText('Reading the host…').length).toBeGreaterThan(1);
  });

  it('turn a skill off on the host, where the skill lives', async () => {
    const toggleSkill = vi.fn(async () => ({ ok: true }));
    withBridge({
      skills: vi.fn(async () => ({
        ok: true,
        skills: [
          { name: 'research', description: 'Look things up', enabled: true },
        ],
      })),
      toggleSkill,
    });
    renderSettings();
    await userEvent.click(screen.getByRole('button', { name: 'Skills' }));
    const skill = await screen.findByRole('switch', { name: 'research' });
    await userEvent.click(skill);
    await waitFor(() =>
      expect(toggleSkill).toHaveBeenCalledWith({
        name: 'research',
        enabled: false,
        profile: '',
      }),
    );
  });

  it('show the tools when they are asked for', async () => {
    withBridge({
      toolsets: vi.fn(async () => ({
        ok: true,
        toolsets: [
          { name: 'browser', label: 'Browser', description: 'Open a page', enabled: false },
        ],
      })),
    });
    renderSettings();
    await userEvent.click(screen.getByRole('button', { name: 'Tools' }));
    expect(
      screen.getByRole('heading', { name: 'Tools' }),
    ).toBeTruthy();
    expect(await screen.findByText('Browser')).toBeTruthy();
  });

  it('open on the page they were sent to', () => {
    withBridge();
    render(
      <ModelPrefsProvider>
        <SettingsView
          status={connected}
          section="connectors"
          onClose={vi.fn()}
          onStatusChange={vi.fn()}
          onRunSetup={vi.fn()}
        />
      </ModelPrefsProvider>,
    );
    expect(
      screen.getByRole('heading', { name: 'Connectors' }),
    ).toBeTruthy();
  });
});
