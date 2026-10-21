import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
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

function renderSetup() {
  const onFinish = vi.fn();
  const onDismiss = vi.fn();
  const view = render(
    <Onboarding onFinish={onFinish} onDismiss={onDismiss} />,
  );
  return { onFinish, onDismiss, container: view.container };
}

/** Walks the person to the handshake, host and key given. */
async function walkTo(
  bridge: Record<string, unknown>,
  { host = 'hermes-box.local', key = 'sk-secret' } = {},
) {
  await userEvent.click(screen.getByRole('button', { name: 'Begin' }));
  await userEvent.type(screen.getByLabelText('SSH host'), host);
  await userEvent.type(screen.getByLabelText('API key'), key);
  await userEvent.click(
    screen.getByRole('button', { name: 'Test the connection' }),
  );
  await waitFor(() => expect(bridge.test).toHaveBeenCalled());
  // The button comes back when the handshake is over, whatever it said.
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: /Test the connection|Continue/ }),
    ).not.toBeDisabled(),
  );
}

/** Walks the person to the first bot. */
async function walkToBot(
  bridge: Record<string, unknown>,
  options: { host?: string; key?: string } = {},
) {
  await walkTo(bridge, options);
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByText(/Give it a face/);
}

afterEach(() => {
  vi.useRealTimers();
});

describe('the setup', () => {
  it('says what the app is before it asks anything', () => {
    makeBridge();
    renderSetup();
    expect(screen.getByText(/A window onto your agents/)).toBeTruthy();
    expect(screen.getByText(/Hermes runs them/)).toBeTruthy();
  });

  it('does not test without a host', async () => {
    makeBridge();
    renderSetup();
    await userEvent.click(screen.getByRole('button', { name: 'Begin' }));
    const test = screen.getByRole('button', { name: 'Test the connection' });
    expect(test).toBeDisabled();
    await userEvent.type(screen.getByLabelText('SSH host'), 'hermes-box.local');
    expect(test).toBeDisabled();
  });

  it('does not test without a key', async () => {
    makeBridge();
    renderSetup();
    await userEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await userEvent.type(screen.getByLabelText('SSH host'), 'hermes-box.local');
    const test = screen.getByRole('button', { name: 'Test the connection' });
    expect(test).toBeDisabled();
    await userEvent.type(screen.getByLabelText('API key'), 'sk-secret');
    expect(test).not.toBeDisabled();
  });

  it('puts the whole connection on one page', async () => {
    makeBridge();
    renderSetup();
    await userEvent.click(screen.getByRole('button', { name: 'Begin' }));
    expect(screen.getByLabelText('SSH host')).toBeTruthy();
    expect(screen.getByLabelText('API key')).toBeTruthy();
    expect(screen.getByText('The host answers')).toBeTruthy();
    expect(screen.getByText('The key is accepted')).toBeTruthy();
    expect(screen.getByText('The tunnel is open')).toBeTruthy();
  });

  it('reads the key from the server when the person asks it to', async () => {
    const bridge = makeBridge();
    renderSetup();
    await userEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await userEvent.type(screen.getByLabelText('SSH host'), 'hermes-box.local');
    await userEvent.click(
      screen.getByRole('button', { name: /Read it from hermes-box.local/ }),
    );
    await waitFor(() => expect(bridge.importKey).toHaveBeenCalled());
    expect(bridge.importKey).toHaveBeenCalledWith({ sshHost: 'hermes-box.local' });
    expect(await screen.findByText(/In the Keychain/)).toBeTruthy();
  });

  it('shakes hands with the host and says what it found', async () => {
    const bridge = makeBridge();
    renderSetup();
    await walkTo(bridge);
    expect(await screen.findByText(/Hermes 0\.21\.5/)).toBeTruthy();
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
    renderSetup();
    await walkTo(bridge);
    expect(await screen.findByText(/port 22: refused/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('says what went wrong when the host says nothing at all', async () => {
    const bridge = makeBridge({
      test: vi.fn(async () => ({ state: 'error' })),
    });
    renderSetup();
    await walkTo(bridge);
    expect(await screen.findByText('The host did not answer.')).toBeTruthy();
  });

  it('says when the connection could not be written down', async () => {
    const bridge = makeBridge({
      saveSettings: vi.fn(async () => ({
        ok: false,
        error: 'Invalid SSH host',
      })),
    });
    renderSetup();
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
    renderSetup();
    await walkTo(bridge);
    expect(await screen.findByText(/port 22: refused/)).toBeTruthy();
  });

  it('uses the key in the Keychain when there is none to type', async () => {
    const bridge = makeBridge();
    renderSetup();
    await userEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await userEvent.type(screen.getByLabelText('SSH host'), 'hermes-box.local');
    await userEvent.click(
      screen.getByRole('button', { name: /Read it from hermes-box.local/ }),
    );
    await waitFor(() => expect(bridge.importKey).toHaveBeenCalled());
    await userEvent.click(
      screen.getByRole('button', { name: 'Test the connection' }),
    );
    await waitFor(() => expect(bridge.test).toHaveBeenCalled());
    expect(bridge.test).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: undefined }),
    );
  });

  it('falls back on the port Hermes uses when the field is emptied', async () => {
    const bridge = makeBridge();
    renderSetup();
    await userEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await userEvent.type(screen.getByLabelText('SSH host'), 'hermes-box.local');
    await userEvent.click(screen.getByRole('button', { name: /The ports/ }));
    await userEvent.clear(screen.getByLabelText('Remote API port'));
    await userEvent.type(screen.getByLabelText('API key'), 'sk-secret');
    await userEvent.click(
      screen.getByRole('button', { name: 'Test the connection' }),
    );
    await waitFor(() => expect(bridge.test).toHaveBeenCalled());
    expect(bridge.test).toHaveBeenCalledWith(
      expect.objectContaining({ apiPort: 8642 }),
    );
  });

  it('shows the ports and the command that will run', async () => {
    makeBridge();
    renderSetup();
    await userEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await userEvent.type(screen.getByLabelText('SSH host'), 'hermes-box.local');
    await userEvent.click(screen.getByRole('button', { name: /The ports/ }));
    expect(screen.getByLabelText('Remote API port')).toBeTruthy();
    expect(screen.getByLabelText('Local tunnel port')).toBeTruthy();
    expect(
      screen.getByText(
        'ssh -N -L 127.0.0.1:18742:127.0.0.1:8642 hermes-box.local',
      ),
    ).toBeTruthy();
  });

  it('says what went wrong when the key cannot be read', async () => {
    makeBridge({
      importKey: vi.fn(async () => ({
        ok: false,
        error: 'API_SERVER_KEY not found in the remote ~/.hermes/.env',
      })),
    });
    renderSetup();
    await userEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await userEvent.type(screen.getByLabelText('SSH host'), 'hermes-box.local');
    await userEvent.click(
      screen.getByRole('button', { name: /Read it from hermes-box.local/ }),
    );
    expect(
      await screen.findByText(/API_SERVER_KEY not found/),
    ).toBeTruthy();
  });

  it('says that nothing answers yet when the host has no bot', async () => {
    const bridge = makeBridge({
      profiles: vi.fn(async () => ({ ok: true, profiles: [] })),
    });
    renderSetup();
    await walkToBot(bridge);
    expect(
      await screen.findByText(/Nothing answers yet/),
    ).toBeTruthy();
  });

  it('creates the first bot on the host', async () => {
    const bridge = makeBridge();
    renderSetup();
    await walkToBot(bridge);
    await userEvent.type(await screen.findByLabelText('Its name'), 'Nova');
    await userEvent.click(screen.getByRole('button', { name: 'Create the bot' }));
    await waitFor(() => expect(bridge.createBot).toHaveBeenCalled());
    expect(bridge.createBot).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'nova', title: 'Nova' }),
    );
  });

  it('shows the bot that was made on the last page', async () => {
    const bridge = makeBridge();
    renderSetup();
    await walkToBot(bridge);
    await userEvent.type(await screen.findByLabelText('Its name'), 'Nova');
    await userEvent.click(screen.getByRole('button', { name: 'Create the bot' }));
    await waitFor(() => expect(bridge.createBot).toHaveBeenCalled());
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText(/You're all set/)).toBeTruthy();
    expect(screen.getByText('Nova')).toBeTruthy();
  });

  it('keeps the colour the person picked for the bot', async () => {
    const bridge = makeBridge();
    renderSetup();
    await walkToBot(bridge);
    await userEvent.type(await screen.findByLabelText('Its name'), 'Nova');
    await userEvent.click(screen.getByRole('button', { name: 'Red' }));
    await userEvent.clear(screen.getByLabelText('Its name'));
    await userEvent.type(screen.getByLabelText('Its name'), 'Nova');
    await userEvent.click(screen.getByRole('button', { name: 'Create the bot' }));
    await waitFor(() => expect(bridge.createBot).toHaveBeenCalled());
    expect(bridge.createBot).toHaveBeenCalledWith(
      expect.objectContaining({ color: '#e8483f' }),
    );
  });

  it('says when the bot could not be created', async () => {
    const bridge = makeBridge({
      createBot: vi.fn(async () => ({
        ok: false,
        error: 'the profile already exists',
      })),
    });
    renderSetup();
    await walkToBot(bridge);
    await userEvent.type(await screen.findByLabelText('Its name'), 'Nova');
    await userEvent.click(screen.getByRole('button', { name: 'Create the bot' }));
    expect(await screen.findByText('the profile already exists')).toBeTruthy();
  });

  it('says what went wrong when the test itself falls over', async () => {
    makeBridge({
      test: vi.fn(async () => {
        throw new Error('the tunnel never came up');
      }),
    });
    renderSetup();
    await userEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await userEvent.type(screen.getByLabelText('SSH host'), 'hermes-box.local');
    await userEvent.type(screen.getByLabelText('API key'), 'sk-secret');
    await userEvent.click(
      screen.getByRole('button', { name: 'Test the connection' }),
    );
    expect(await screen.findByText(/the tunnel never came up/)).toBeTruthy();
  });

  it('says what went wrong when the tunnel says nothing', async () => {
    const bridge = makeBridge({
      connect: vi.fn(async () => ({ state: 'error' })),
    });
    renderSetup();
    await walkTo(bridge);
    expect(await screen.findByText('The tunnel did not open.')).toBeTruthy();
  });

  it('keeps the key it already had when the settings say nothing', async () => {
    const bridge = makeBridge({
      saveSettings: vi.fn(async () => ({ ok: true })),
    });
    renderSetup();
    await walkTo(bridge);
    expect(bridge.connect).toHaveBeenCalled();
  });

  it('falls back on the local port when the field is emptied', async () => {
    const bridge = makeBridge();
    renderSetup();
    await userEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await userEvent.type(screen.getByLabelText('SSH host'), 'hermes-box.local');
    await userEvent.type(screen.getByLabelText('API key'), 'sk-secret');
    await userEvent.click(screen.getByRole('button', { name: /The ports/ }));
    await userEvent.clear(screen.getByLabelText('Local tunnel port'));
    await userEvent.click(
      screen.getByRole('button', { name: 'Test the connection' }),
    );
    await waitFor(() => expect(bridge.saveSettings).toHaveBeenCalled());
    expect(bridge.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ localPort: 18742 }),
    );
  });

  it('calls the bot by the name it was given when the server says nothing', async () => {
    const bridge = makeBridge({
      createBot: vi.fn(async () => ({ ok: true })),
    });
    renderSetup();
    await walkToBot(bridge);
    await userEvent.type(await screen.findByLabelText('Its name'), 'Nova');
    await userEvent.click(screen.getByRole('button', { name: 'Create the bot' }));
    await waitFor(() => expect(bridge.createBot).toHaveBeenCalled());
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Nova')).toBeTruthy();
  });

  it('finishes the setup and remembers that it was done', async () => {
    const bridge = makeBridge();
    const { onFinish, onDismiss } = renderSetup();
    await walkToBot(bridge);
    await userEvent.type(await screen.findByLabelText('Its name'), 'Nova');
    await userEvent.click(screen.getByRole('button', { name: 'Create the bot' }));
    await waitFor(() => expect(bridge.createBot).toHaveBeenCalled());
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.click(
      await screen.findByRole('button', { name: 'Start talking' }),
    );
    await waitFor(() => expect(onFinish).toHaveBeenCalled());
    expect(onDismiss).not.toHaveBeenCalled();
    expect(bridge.setOnboarding).toHaveBeenCalledWith({ completed: true });
  });

  it('lets the person walk away from the setup', async () => {
    const bridge = makeBridge();
    const { onFinish, onDismiss } = renderSetup();
    await userEvent.click(screen.getByRole('button', { name: 'Skip' }));
    await waitFor(() => expect(onDismiss).toHaveBeenCalled());
    expect(onFinish).not.toHaveBeenCalled();
    expect(bridge.setOnboarding).toHaveBeenCalledWith({ completed: true });
  });

  it('goes back to the step before', async () => {
    makeBridge();
    renderSetup();
    await userEvent.click(screen.getByRole('button', { name: 'Begin' }));
    expect(screen.getByText(/Connect your Hermes/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText(/A window onto your agents/)).toBeTruthy();
  });

  it('shows the steps it has walked through', async () => {
    makeBridge();
    renderSetup();
    const steps = screen.getByRole('navigation', { name: 'Setup steps' });
    await userEvent.click(screen.getByRole('button', { name: 'Begin' }));
    expect(
      within(steps).getByRole('button', { name: /The setup/ }),
    ).toBeTruthy();
    // The steps ahead are not there yet.
    expect(
      within(steps).getByRole('button', { name: /Your first bot/ }),
    ).toBeDisabled();
  });

  it('calls the bots by their profile name when they have no title', async () => {
    const bridge = makeBridge({
      profiles: vi.fn(async () => ({
        ok: true,
        profiles: [{ name: 'bob', color: '#e8483f', shape: 'galet' }],
        primary: { name: 'default', color: '#8b5cf6', shape: 'cercle' },
      })),
    });
    renderSetup();
    await walkToBot(bridge);
    expect(await screen.findByText('Chief of Staff')).toBeTruthy();
    expect(screen.getByText('bob')).toBeTruthy();
  });

  it('goes on with the enter key', async () => {
    makeBridge();
    renderSetup();
    await userEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await userEvent.keyboard('{Enter}');
    expect(screen.getByText(/Connect your Hermes/)).toBeTruthy();
  });

  it('does not go on with the enter key when nothing is ready', async () => {
    makeBridge();
    renderSetup();
    await userEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await userEvent.keyboard('{Enter}');
    // The host is not known yet: the connection cannot be tested.
    expect(screen.getByText(/Connect your Hermes/)).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Test the connection' }),
    ).toBeDisabled();
  });

  it('changes the colour and the shape of the actor every two seconds', async () => {
    makeBridge();
    vi.useFakeTimers();
    const { container } = renderSetup();
    const light = () =>
      (
        container.querySelector('.onboarding') as HTMLElement
      ).style.getPropertyValue('--actor-color');
    const body = () =>
      container.querySelector('.stage-bloub mask path')?.getAttribute('d');

    // The actor draws its first frame.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120);
    });
    const before = light();
    const shapeBefore = body();
    expect(before).toBeTruthy();
    expect(shapeBefore).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });
    expect(light()).not.toBe(before);
    expect(body()).not.toBe(shapeBefore);
  });

  it('finishes even when the app could not write the flag down', async () => {
    const bridge = makeBridge({
      setOnboarding: vi.fn(async () => {
        throw new Error('the store is not writable');
      }),
    });
    const { onFinish } = renderSetup();
    await walkToBot(bridge);
    await userEvent.type(await screen.findByLabelText('Its name'), 'Nova');
    await userEvent.click(screen.getByRole('button', { name: 'Create the bot' }));
    await waitFor(() => expect(bridge.createBot).toHaveBeenCalled());
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.click(
      await screen.findByRole('button', { name: 'Start talking' }),
    );
    await waitFor(() => expect(onFinish).toHaveBeenCalled());
  });
});
