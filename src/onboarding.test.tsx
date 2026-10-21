import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Onboarding } from './onboarding';

/** A bridge that answers everything the setup asks, and remembers it. */
function makeBridge(overrides: Record<string, unknown> = {}) {
  const bridge = {
    getSettings: vi.fn(async () => ({
      sshHost: '',
      apiPort: 8642,
      localPort: 18742,
      autoConnect: true,
      hasKey: false,
      onboardingCompleted: false,
    })),
    saveSettings: vi.fn(async () => ({ ok: true })),
    importKey: vi.fn(async () => ({ ok: true, keyLength: 64 })),
    test: vi.fn(async () => ({
      state: 'connected',
      version: '0.21.5',
      gateway: 'hermes-gateway',
    })),
    connect: vi.fn(async () => ({ state: 'connected' })),
    createBot: vi.fn(async () => ({
      ok: true,
      name: 'nova',
      title: 'Nova',
      color: '#e8483f',
    })),
    profiles: vi.fn(async () => ({
      ok: true,
      profiles: [{ name: 'bob', title: 'Bob', color: '#e8483f', shape: 'galet' }],
      primary: { title: 'Chief of Staff', color: '#8b5cf6', shape: 'cercle' },
    })),
    setOnboarding: vi.fn(async () => ({ ok: true })),
    ...overrides,
  };
  (window as unknown as { hermes: unknown }).hermes = bridge;
  return bridge;
}

function renderSetup(bridge: Record<string, unknown>) {
  const onFinish = vi.fn();
  const onDismiss = vi.fn();
  render(<Onboarding onFinish={onFinish} onDismiss={onDismiss} />);
  return { onFinish, onDismiss };
}

/** Walks the person to the handshake, host and key given. */
async function walkTo(
  bridge: Record<string, unknown>,
  { host = 'hermes-box.local', key = 'sk-secret' } = {},
) {
  await userEvent.click(screen.getByRole('button', { name: /Set up Hermes Bot/ }));
  await userEvent.type(screen.getByLabelText('SSH host'), host);
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await userEvent.type(screen.getByLabelText('API key'), key);
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await waitFor(() => expect(bridge.test).toHaveBeenCalled());
}

describe('the setup', () => {
  it('says what the app is before it asks anything', () => {
    makeBridge();
    renderSetup(makeBridge());
    expect(screen.getByText(/A window onto your agents/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'The host' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'The key' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'The crew' })).toBeTruthy();
  });

  it('does not go on without a host', async () => {
    makeBridge();
    renderSetup(makeBridge());
    await userEvent.click(screen.getByRole('button', { name: /Set up Hermes Bot/ }));
    const next = screen.getByRole('button', { name: 'Continue' });
    expect(next).toBeDisabled();
    await userEvent.type(screen.getByLabelText('SSH host'), 'hermes-box.local');
    expect(next).not.toBeDisabled();
  });

  it('does not go on without a key', async () => {
    makeBridge();
    renderSetup(makeBridge());
    await userEvent.click(screen.getByRole('button', { name: /Set up Hermes Bot/ }));
    await userEvent.type(screen.getByLabelText('SSH host'), 'hermes-box.local');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    const next = screen.getByRole('button', { name: 'Continue' });
    expect(next).toBeDisabled();
    await userEvent.type(screen.getByLabelText('API key'), 'sk-secret');
    expect(next).not.toBeDisabled();
  });

  it('reads the key from the server when the person asks it to', async () => {
    const bridge = makeBridge();
    renderSetup(bridge);
    await userEvent.click(screen.getByRole('button', { name: /Set up Hermes Bot/ }));
    await userEvent.type(screen.getByLabelText('SSH host'), 'hermes-box.local');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.click(
      screen.getByRole('button', { name: /Read it from hermes-box.local/ }),
    );
    await waitFor(() => expect(bridge.importKey).toHaveBeenCalled());
    expect(bridge.importKey).toHaveBeenCalledWith({ sshHost: 'hermes-box.local' });
    expect(await screen.findByText(/In the Keychain/)).toBeTruthy();
  });

  it('shakes hands with the host and says what it found', async () => {
    const bridge = makeBridge();
    renderSetup(bridge);
    await walkTo(bridge);
    await waitFor(() =>
      expect(screen.getByText(/Hermes 0\.21\.5/)).toBeTruthy(),
    );
    expect(screen.getByText(/gateway hermes-gateway/)).toBeTruthy();
    expect(bridge.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        sshHost: 'hermes-box.local',
        apiPort: 8642,
        apiKey: 'sk-secret',
      }),
    );
    expect(bridge.connect).toHaveBeenCalled();
  });

  it('says what went wrong when the host does not answer', async () => {
    const bridge = makeBridge({
      test: vi.fn(async () => ({
        state: 'error',
        message: 'ssh: connect to host hermes-box.local port 22: refused',
      })),
    });
    renderSetup(bridge);
    await walkTo(bridge);
    expect(
      await screen.findByText(/port 22: refused/),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('lists the bots the host serves', async () => {
    const bridge = makeBridge();
    renderSetup(bridge);
    await walkTo(bridge);
    await waitFor(() => expect(bridge.connect).toHaveBeenCalled());
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Bob')).toBeTruthy();
    expect(screen.getByText('Chief of Staff')).toBeTruthy();
  });

  it('creates the first bot on the host', async () => {
    const bridge = makeBridge();
    renderSetup(bridge);
    await walkTo(bridge);
    await waitFor(() => expect(bridge.connect).toHaveBeenCalled());
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.type(
      await screen.findByLabelText('Bot name'),
      'Nova',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Create the bot' }));
    await waitFor(() => expect(bridge.createBot).toHaveBeenCalled());
    expect(bridge.createBot).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'nova', title: 'Nova' }),
    );
  });

  it('finishes the setup and remembers that it was done', async () => {
    const bridge = makeBridge();
    const { onFinish, onDismiss } = renderSetup(bridge);
    await walkTo(bridge);
    await waitFor(() => expect(bridge.connect).toHaveBeenCalled());
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText(/You're all set/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Start talking' }));
    await waitFor(() => expect(onFinish).toHaveBeenCalled());
    expect(onDismiss).not.toHaveBeenCalled();
    expect(bridge.setOnboarding).toHaveBeenCalledWith({ completed: true });
  });

  it('lets the person walk away from the setup', async () => {
    const bridge = makeBridge();
    const { onFinish, onDismiss } = renderSetup(bridge);
    await userEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
    await waitFor(() => expect(onDismiss).toHaveBeenCalled());
    expect(onFinish).not.toHaveBeenCalled();
    expect(bridge.setOnboarding).toHaveBeenCalledWith({ completed: true });
  });

  it('goes back to the step before', async () => {
    const bridge = makeBridge();
    renderSetup(bridge);
    await userEvent.click(screen.getByRole('button', { name: /Set up Hermes Bot/ }));
    await userEvent.type(screen.getByLabelText('SSH host'), 'hermes-box.local');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText(/The key to the door/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText(/Where does Hermes run\?/)).toBeTruthy();
  });

  it('shows the steps it has walked through', async () => {
    const bridge = makeBridge();
    renderSetup(bridge);
    const steps = screen.getByRole('navigation', { name: 'Setup steps' });
    await userEvent.click(screen.getByRole('button', { name: /Set up Hermes Bot/ }));
    await userEvent.type(screen.getByLabelText('SSH host'), 'hermes-box.local');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(
      within(steps).getByRole('button', { name: /The host/ }),
    ).toBeTruthy();
    // The steps ahead are not there yet.
    expect(
      within(steps).getByRole('button', { name: /Your crew/ }),
    ).toBeDisabled();
  });

  it('goes on with the enter key', async () => {
    const bridge = makeBridge();
    renderSetup(bridge);
    await userEvent.click(screen.getByRole('button', { name: /Set up Hermes Bot/ }));
    await userEvent.type(screen.getByLabelText('SSH host'), 'hermes-box.local{Enter}');
    expect(screen.getByText(/The key to the door/)).toBeTruthy();
  });

  it('shows the ports and the command that will run', async () => {
    const bridge = makeBridge();
    renderSetup(bridge);
    await userEvent.click(screen.getByRole('button', { name: /Set up Hermes Bot/ }));
    await userEvent.type(screen.getByLabelText('SSH host'), 'hermes-box.local');
    await userEvent.click(screen.getByRole('button', { name: 'Advanced' }));
    expect(screen.getByLabelText('Remote API port')).toBeTruthy();
    expect(screen.getByLabelText('Local tunnel port')).toBeTruthy();
    expect(
      screen.getByText(
        'ssh -N -L 127.0.0.1:18742:127.0.0.1:8642 hermes-box.local',
      ),
    ).toBeTruthy();
  });

  it('falls back on the port Hermes uses when the field is emptied', async () => {
    const bridge = makeBridge();
    renderSetup(bridge);
    await userEvent.click(screen.getByRole('button', { name: /Set up Hermes Bot/ }));
    await userEvent.type(screen.getByLabelText('SSH host'), 'hermes-box.local');
    await userEvent.click(screen.getByRole('button', { name: 'Advanced' }));
    await userEvent.clear(screen.getByLabelText('Remote API port'));
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.type(screen.getByLabelText('API key'), 'sk-secret');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(bridge.test).toHaveBeenCalled());
    expect(bridge.test).toHaveBeenCalledWith(
      expect.objectContaining({ apiPort: 8642 }),
    );
  });

  it('uses the key in the Keychain when there is none to type', async () => {
    const bridge = makeBridge();
    renderSetup(bridge);
    await userEvent.click(screen.getByRole('button', { name: /Set up Hermes Bot/ }));
    await userEvent.type(screen.getByLabelText('SSH host'), 'hermes-box.local');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.click(
      screen.getByRole('button', { name: /Read it from hermes-box.local/ }),
    );
    await waitFor(() => expect(bridge.importKey).toHaveBeenCalled());
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(bridge.test).toHaveBeenCalled());
    expect(bridge.test).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: undefined }),
    );
  });

  it('says what went wrong when the host says nothing at all', async () => {
    const bridge = makeBridge({
      test: vi.fn(async () => ({ state: 'error' })),
    });
    renderSetup(bridge);
    await walkTo(bridge);
    expect(
      await screen.findByText('The host did not answer.'),
    ).toBeTruthy();
  });

  it('says what it found when the host has no version to give', async () => {
    const bridge = makeBridge({
      test: vi.fn(async () => ({ state: 'connected' })),
    });
    renderSetup(bridge);
    await walkTo(bridge);
    expect(await screen.findByText(/Hermes \?/)).toBeTruthy();
    expect(screen.getByText(/gateway ok/)).toBeTruthy();
  });

  it('says when the connection could not be written down', async () => {
    const bridge = makeBridge({
      saveSettings: vi.fn(async () => ({
        ok: false,
        error: 'Invalid SSH host',
      })),
    });
    renderSetup(bridge);
    await walkTo(bridge);
    expect(await screen.findByText('Invalid SSH host')).toBeTruthy();
  });

  it('says when the tunnel did not open', async () => {
    const bridge = makeBridge({
      connect: vi.fn(async () => ({
        state: 'error',
        message: 'ssh: connect to host port 22: refused',
      })),
    });
    renderSetup(bridge);
    await walkTo(bridge);
    expect(
      await screen.findByText(/port 22: refused/),
    ).toBeTruthy();
  });

  it('says when the bot could not be created', async () => {
    const bridge = makeBridge({
      createBot: vi.fn(async () => ({
        ok: false,
        error: 'the profile already exists',
      })),
    });
    renderSetup(bridge);
    await walkTo(bridge);
    await waitFor(() => expect(bridge.connect).toHaveBeenCalled());
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.type(await screen.findByLabelText('Bot name'), 'Nova');
    await userEvent.click(screen.getByRole('button', { name: 'Create the bot' }));
    expect(
      await screen.findByText('the profile already exists'),
    ).toBeTruthy();
  });

  it('keeps the colour the person picked for the bot', async () => {
    const bridge = makeBridge();
    renderSetup(bridge);
    await walkTo(bridge);
    await waitFor(() => expect(bridge.connect).toHaveBeenCalled());
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.type(await screen.findByLabelText('Bot name'), 'Nova');
    await userEvent.click(screen.getByRole('button', { name: 'Red' }));
    await userEvent.clear(screen.getByLabelText('Bot name'));
    await userEvent.type(screen.getByLabelText('Bot name'), 'Nova');
    await userEvent.click(screen.getByRole('button', { name: 'Create the bot' }));
    await waitFor(() => expect(bridge.createBot).toHaveBeenCalled());
    expect(bridge.createBot).toHaveBeenCalledWith(
      expect.objectContaining({ color: '#e8483f' }),
    );
  });

  it('counts one bot as one bot', async () => {
    const bridge = makeBridge({
      profiles: vi.fn(async () => ({
        ok: true,
        profiles: [],
        primary: { name: 'default', shape: 'cercle' },
      })),
    });
    renderSetup(bridge);
    await walkTo(bridge);
    await waitFor(() => expect(bridge.connect).toHaveBeenCalled());
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('1 bot on hermes-box.local')).toBeTruthy();
  });

  it('finishes even when the app could not write the flag down', async () => {
    const bridge = makeBridge({
      setOnboarding: vi.fn(async () => {
        throw new Error('the store is not writable');
      }),
    });
    const { onFinish } = renderSetup(bridge);
    await walkTo(bridge);
    await waitFor(() => expect(bridge.connect).toHaveBeenCalled());
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.click(screen.getByRole('button', { name: 'Start talking' }));
    await waitFor(() => expect(onFinish).toHaveBeenCalled());
  });
});
