import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Onboarding } from './onboarding';
import { profileColor } from './profileColor';

/** A bridge that answers everything the setup asks, and remembers it. */
function makeBridge(
  overrides: Record<string, unknown> = {},
  settings: Record<string, unknown> = {},
) {
  const bridge = {
    getSettings: vi.fn(async () => ({
      mode: 'ssh',
      configured: false,
      sshHost: '',
      apiPort: 8642,
      localPort: 18742,
      autoConnect: true,
      hasKey: false,
      onboardingCompleted: false,
      ...settings,
    })),
    saveSettings: vi.fn(async () => ({ ok: true })),
    importKey: vi.fn(async () => ({ ok: true, keyLength: 64 })),
    openApiServer: vi.fn(async () => ({ ok: true, keyLength: 64 })),
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
    sshHosts: vi.fn(async () => ({ ok: true, hosts: ['jetson', 'lab-box'] })),
    /** The shell says when a bot that was made is served. */
    onBotReady: vi.fn(() => () => undefined),
    updateBot: vi.fn(async () => ({ ok: true })),
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

/** Puts the person on the machine they said their Hermes runs on. */
async function chooseMode(mode: 'local' | 'ssh') {
  await userEvent.click(
    screen.getByRole('radio', {
      name: mode === 'local' ? /This Mac/ : /Another machine/,
    }),
  );
}

/** Walks the person to the handshake, host and key given. */
async function walkTo(
  bridge: Record<string, unknown>,
  { host = 'hermes-box.local', key = 'sk-secret', mode = 'ssh' } = {},
) {
  await userEvent.click(screen.getByRole('button', { name: 'Begin' }));
  if (mode === 'ssh') {
    await userEvent.type(screen.getByLabelText('SSH host'), host);
  }
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

/** Walks the person to the page that asks for the bot's name. */
async function walkToBot(
  bridge: Record<string, unknown>,
  options: { host?: string; key?: string } = {},
) {
  await walkTo(bridge, options);
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByText(/What is it called\?/);
}

/** Walks the person all the way to the last page, bot and all. */
async function walkToReady(bridge: Record<string, unknown>, name = 'Nova') {
  await walkToBot(bridge);
  await userEvent.type(screen.getByLabelText('Its name'), name);
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByText(/What shape\?/);
  // A click on the shape is the way forward.
  await userEvent.click(screen.getByLabelText('Hexagon'));
  await screen.findByText(/What colour\?/);
  // A click on the colour makes the bot.
  await userEvent.click(screen.getByLabelText('Amber'));
  await waitFor(() => expect(bridge.createBot).toHaveBeenCalled());
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

  it('asks where Hermes runs before anything else', async () => {
    makeBridge();
    renderSetup();
    await userEvent.click(screen.getByRole('button', { name: 'Begin' }));
    expect(screen.getByText('Where does Hermes run?')).toBeTruthy();
    expect(
      screen.getByRole('radio', { name: /This Mac/ }),
    ).toBeTruthy();
    expect(
      screen.getByRole('radio', { name: /Another machine/ }),
    ).toBeTruthy();
  });

  it('lists the machines the SSH config names', async () => {
    const bridge = makeBridge();
    renderSetup();
    await userEvent.click(screen.getByRole('button', { name: 'Begin' }));
    expect(await screen.findByRole('button', { name: /jetson/ })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /lab-box/ }),
    ).toBeTruthy();
    expect(bridge.sshHosts).toHaveBeenCalled();
  });

  it('connects to a saved host with one click', async () => {
    const bridge = makeBridge();
    renderSetup();
    await userEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await userEvent.click(await screen.findByRole('button', { name: /jetson/ }));
    // The key is read from the machine, the connection is written down
    // and opened: none of it asked for.
    expect(bridge.importKey).toHaveBeenCalledWith({
      mode: 'ssh',
      sshHost: 'jetson',
    });
    expect(bridge.test).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'ssh', sshHost: 'jetson' }),
    );
    expect(bridge.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'ssh', sshHost: 'jetson' }),
    );
    expect(bridge.connect).toHaveBeenCalled();
    expect(await screen.findByText(/Hermes 0\.21\.5/)).toBeTruthy();
  });

  it('asks for the key when the saved host has none to give', async () => {
    makeBridge({
      importKey: vi.fn(async () => ({
        ok: false,
        error: 'API_SERVER_KEY not found in the remote ~/.hermes/.env',
      })),
    });
    renderSetup();
    await userEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await userEvent.click(
      await screen.findByRole('button', { name: /jetson/ }),
    );
    expect(
      await screen.findByText(/API_SERVER_KEY not found/),
    ).toBeTruthy();
    // The field is the asking: the key goes there.
    expect(screen.getByLabelText('API key')).toBeTruthy();
  });

  it('says when no host is saved, and keeps the one to type', async () => {
    makeBridge({
      sshHosts: vi.fn(async () => ({ ok: true, hosts: [] })),
    });
    renderSetup();
    await userEvent.click(screen.getByRole('button', { name: 'Begin' }));
    expect(
      await screen.findByText(/No host saved in your SSH config/),
    ).toBeTruthy();
    expect(screen.getByLabelText('SSH host')).toBeTruthy();
  });

  it('goes back and forth between the two machines', async () => {
    makeBridge();
    renderSetup();
    await userEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await chooseMode('local');
    expect(screen.queryByLabelText('SSH host')).toBeNull();
    await chooseMode('ssh');
    expect(screen.getByLabelText('SSH host')).toBeTruthy();
  });

  it('asks for no host when Hermes runs on this machine', async () => {
    makeBridge();
    renderSetup();
    await userEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await chooseMode('local');
    expect(screen.queryByLabelText('SSH host')).toBeNull();
    // The checks say what happens, not what a tunnel does.
    expect(screen.getByText('Hermes is running')).toBeTruthy();
    expect(screen.getByText('The app is connected')).toBeTruthy();
  });

  it('scans this Mac before asking anything else', async () => {
    const bridge = makeBridge();
    renderSetup();
    await userEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await chooseMode('local');
    await waitFor(() => expect(bridge.test).toHaveBeenCalled());
    expect(bridge.importKey).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'local' }),
    );
    expect(bridge.test).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'local', apiPort: 8642 }),
    );
    expect(bridge.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'local' }),
    );
    expect(bridge.connect).toHaveBeenCalled();
    expect(await screen.findByText(/Hermes 0\.21\.5/)).toBeTruthy();
    // The key the scan read is only reported, not shown.
    expect(await screen.findByText('In the Keychain')).toBeTruthy();
  });

  it('says when nothing answers on this Mac, and asks what is running', async () => {
    makeBridge({
      test: vi.fn(async () => ({
        state: 'error',
        message: 'Nothing is listening on that port',
      })),
    });
    renderSetup();
    await userEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await chooseMode('local');
    expect(
      await screen.findByText('No Hermes answered on 127.0.0.1:8642. Is it running?'),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Scan again' }),
    ).toBeTruthy();
  });

  it('asks for the key when this Mac has none to read', async () => {
    makeBridge({
      importKey: vi.fn(async () => ({
        ok: false,
        error: 'API_SERVER_KEY not found in ~/.hermes/.env',
      })),
    });
    renderSetup();
    await userEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await chooseMode('local');
    expect(
      await screen.findByText(/API_SERVER_KEY not found/),
    ).toBeTruthy();
    // Nothing is asked to be pasted: the words only say where the app
    // will find a key once Hermes is set up.
    expect(screen.queryByLabelText('API key')).toBeNull();
    expect(
      await screen.findByText(/API_SERVER_KEY from ~\/\.hermes\/\.env/),
    ).toBeTruthy();
  });

  it('offers to turn the API server on when this Mac has no key', async () => {
    const bridge = makeBridge({
      importKey: vi.fn(async () => ({
        ok: false,
        error: 'API_SERVER_KEY not found in ~/.hermes/.env',
      })),
    });
    renderSetup();
    await userEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await chooseMode('local');
    const open = await screen.findByRole('button', {
      name: 'Turn the API server on',
    });
    // What it will do is said before it is pressed, including the cost of
    // the restart and the promise about a key that is already there.
    expect(
      screen.getByText(/A key already there is never replaced/),
    ).toBeTruthy();
    await userEvent.click(open);
    expect(bridge.openApiServer).toHaveBeenCalledWith({
      mode: 'local',
      sshHost: undefined,
    });
    // The failed scan never reached the host: it stopped at the missing key.
    // With one in place the setup walks its own path, and the key it never
    // saw is read back the way every key is read back.
    await waitFor(() => expect(bridge.test).toHaveBeenCalledTimes(1));
    expect(bridge.test).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'local' }),
    );
  });

  it('says why the key could not be written, and offers nothing to press', async () => {
    makeBridge({
      importKey: vi.fn(async () => ({
        ok: false,
        error: 'API_SERVER_KEY not found in ~/.hermes/.env',
      })),
      openApiServer: vi.fn(async () => ({
        ok: false,
        error: 'API_SERVER_KEY is already set on this host, and is not replaced.',
      })),
    });
    renderSetup();
    await userEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await chooseMode('local');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Turn the API server on' }),
    );
    expect(
      await screen.findByText(/already set on this host/),
    ).toBeTruthy();
    // The failure is no longer the missing key, so there is nothing left to
    // open: the button goes away and the words stay.
    expect(
      screen.queryByRole('button', { name: 'Turn the API server on' }),
    ).toBeNull();
  });

  it('offers no such button when the failure is the connection, not the key', async () => {
    makeBridge({
      test: vi.fn(async () => ({
        state: 'error',
        message: 'Nothing is listening on that port',
      })),
    });
    renderSetup();
    await userEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await chooseMode('local');
    expect(
      await screen.findByText(/No Hermes answered on 127\.0\.0\.1:8642/),
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Turn the API server on' }),
    ).toBeNull();
  });

  it('offers the repair when a shut door answers as a connection failure', async () => {
    // The first run of a machine that never had a key: the API server was
    // never started, so the scan gets no answer at all and never hears the
    // words "API_SERVER_KEY". The button is offered all the same, because
    // what it needs to know is that there is no key, not how the door said so.
    makeBridge({
      importKey: vi.fn(async () => ({
        ok: false,
        error: 'No Hermes answered on 127.0.0.1:8642',
      })),
    });
    renderSetup();
    await userEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await chooseMode('local');
    expect(
      await screen.findByText(/No Hermes answered on 127\.0\.0\.1:8642/),
    ).toBeTruthy();
    expect(
      await screen.findByRole('button', { name: 'Turn the API server on' }),
    ).toBeTruthy();
  });

  it('scans again when the person asks for it', async () => {
    const bridge = makeBridge({
      test: vi
        .fn()
        .mockResolvedValueOnce({
          state: 'error',
          message: 'Nothing is listening on that port',
        })
        .mockResolvedValueOnce({
          state: 'connected',
          version: '0.21.5',
          gateway: 'hermes-gateway',
        }),
    });
    renderSetup();
    await userEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await chooseMode('local');
    expect(
      await screen.findByText(/No Hermes answered on 127\.0\.0\.1:8642/),
    ).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Scan again' }));
    await waitFor(() => expect(bridge.test).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/Hermes 0\.21\.5/)).toBeTruthy();
  });

  it('shows the port and no tunnel when Hermes runs on this machine', async () => {
    makeBridge();
    renderSetup();
    await userEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await chooseMode('local');
    await userEvent.click(screen.getByRole('button', { name: /The ports/ }));
    expect(screen.getByLabelText('API port')).toBeTruthy();
    expect(screen.queryByLabelText('Local tunnel port')).toBeNull();
    expect(
      screen.getByText('127.0.0.1:8642 — no tunnel, no SSH.'),
    ).toBeTruthy();
  });

  it('keeps the mode the app already knew', async () => {
    makeBridge({}, { mode: 'local' });
    renderSetup();
    await userEvent.click(screen.getByRole('button', { name: 'Begin' }));
    expect(
      screen.getByRole('radio', { name: /This Mac/ }),
    ).toBeChecked();
    expect(screen.queryByLabelText('SSH host')).toBeNull();
  });

  it('says on the last page where Hermes runs', async () => {
    makeBridge();
    renderSetup();
    await userEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await chooseMode('local');
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Continue' }),
      ).not.toBeDisabled(),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByText(/What is it called\?/);
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(await screen.findByText('on this Mac')).toBeTruthy();
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
    expect(bridge.importKey).toHaveBeenCalledWith({
      mode: 'ssh',
      sshHost: 'hermes-box.local',
    });
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
        mode: 'ssh',
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
    // Saying it again is asking again: the words do not change the answer.
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(bridge.test).toHaveBeenCalledTimes(2));
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

  it('does not show the bots the host already serves', async () => {
    const bridge = makeBridge();
    renderSetup();
    await walkToBot(bridge);
    expect(screen.queryByText('Bob')).toBeNull();
    expect(screen.queryByText('Chief of Staff')).toBeNull();
  });

  it('asks for the name, the shape and the colour, one page at a time', async () => {
    const bridge = makeBridge();
    renderSetup();
    await walkToBot(bridge);
    expect(screen.getByText(/What is it called\?/)).toBeTruthy();
    await userEvent.type(screen.getByLabelText('Its name'), 'Nova');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText(/What shape\?/)).toBeTruthy();
    expect(screen.getByLabelText('Pebble')).toBeTruthy();
    // The click on the shape is the way on.
    await userEvent.click(screen.getByLabelText('Pebble'));
    expect(await screen.findByText(/What colour\?/)).toBeTruthy();
    expect(screen.getByLabelText('Red')).toBeTruthy();
  });

  it('paints the big shape with the bot colour', async () => {
    const bridge = makeBridge();
    const { container } = renderSetup();
    await walkToBot(bridge);
    await userEvent.type(screen.getByLabelText('Its name'), 'Nova');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByText(/What shape\?/);
    // The preview above the grid is the bot already: its colour, big.
    const light = (
      container.querySelector('.onboarding') as HTMLElement
    ).style.getPropertyValue('--actor-color');
    expect(light).toBe(profileColor('nova'));
  });

  it('shows the actor wearing the shape that is being picked', async () => {
    const bridge = makeBridge();
    const { container } = renderSetup();
    await walkToBot(bridge);
    await userEvent.type(screen.getByLabelText('Its name'), 'Nova');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByText(/What shape\?/);
    const shapeOf = () =>
      container.querySelector('.mood-bloub mask path')?.getAttribute('d');
    const before = shapeOf();
    await userEvent.click(screen.getByLabelText('Drop'));
    await waitFor(() => expect(shapeOf()).not.toBe(before));
  });

  it('creates the first bot on the host', async () => {
    const bridge = makeBridge();
    renderSetup();
    await walkToReady(bridge);
    expect(bridge.createBot).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'nova', title: 'Nova' }),
    );
  });

  it('shows the bot that was made on the last page', async () => {
    const bridge = makeBridge();
    renderSetup();
    await walkToReady(bridge);
    expect(await screen.findByText(/You're all set/)).toBeTruthy();
    expect(screen.getByText('Nova')).toBeTruthy();
  });

  it('lets the arrival celebrate, in the colour of the bot it made', async () => {
    const bridge = makeBridge();
    const { container } = renderSetup();
    await walkToReady(bridge);
    await screen.findByText(/You're all set/);
    const face = container.querySelector<HTMLElement>('.onboarding-actor .mood-bloub');
    expect(face?.dataset.mood).toBe('completed');
    // The celebration wears the colour the app paints with from here on.
    const light = (
      container.querySelector('.onboarding') as HTMLElement
    ).style.getPropertyValue('--actor-color');
    expect(face?.querySelector('rect')?.getAttribute('fill')).toBe(light);
  });

  it('lets the person leave the bot for later', async () => {
    const bridge = makeBridge();
    renderSetup();
    await walkToBot(bridge);
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(await screen.findByText(/You're all set/)).toBeTruthy();
    expect(bridge.createBot).not.toHaveBeenCalled();
  });

  it('keeps the colour the person picked for the bot', async () => {
    const bridge = makeBridge();
    renderSetup();
    await walkToBot(bridge);
    await userEvent.type(screen.getByLabelText('Its name'), 'Nova');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByText(/What shape\?/);
    await userEvent.click(screen.getByLabelText('Hexagon'));
    await screen.findByText(/What colour\?/);
    await userEvent.click(screen.getByLabelText('Red'));
    await waitFor(() => expect(bridge.createBot).toHaveBeenCalled());
    expect(bridge.createBot).toHaveBeenCalledWith(
      expect.objectContaining({ color: '#e8483f', shape: 'hexagone' }),
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
    await userEvent.type(screen.getByLabelText('Its name'), 'Nova');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByText(/What shape\?/);
    await userEvent.click(screen.getByLabelText('Hexagon'));
    await screen.findByText(/What colour\?/);
    await userEvent.click(screen.getByLabelText('Amber'));
    expect(await screen.findByText('the profile already exists')).toBeTruthy();
  });

  it('shows a bot that was made but has not answered yet', async () => {
    const bridge = makeBridge({
      createBot: vi.fn(async () => ({
        ok: false,
        created: true,
        name: 'nova',
        title: 'Nova',
        color: '#e8483f',
        error:
          '“nova” was created on the host, but the app is not connected to Hermes right now — connect, then open the bot.',
      })),
    });
    renderSetup();
    await walkToReady(bridge);
    // The bot exists, so the setup shows it and says what is missing: the
    // person is not asked for a name Hermes would refuse as already taken.
    expect(await screen.findByText(/You're all set/)).toBeTruthy();
    expect(screen.getByText('Nova')).toBeTruthy();
    expect(screen.getByText(/was created on the host/)).toBeTruthy();
    expect(screen.queryByText(/could not be created/)).toBeNull();
  });

  it('lets the person finish while the gateway connects the bot', async () => {
    const bridge = makeBridge({
      createBot: vi.fn(async () => ({
        ok: true,
        name: 'nova',
        title: 'Nova',
        color: '#e8483f',
        served: false,
      })),
    });
    renderSetup();
    await walkToReady(bridge);
    // The bot is made on the host and shown at once: no waiting animation on
    // the page, the button says where things stand instead.
    expect(
      await screen.findByText('Hermes is starting this bot — it will answer in a moment.'),
    ).toBeTruthy();
    expect(screen.queryByText(/Connecting your bot/)).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Start talking anyway' }),
    ).toBeEnabled();
  });

  it('goes back to the connection when the link dropped before the bot', async () => {
    const bridge = makeBridge({
      createBot: vi.fn(async () => ({
        ok: false,
        error:
          'Not connected to Hermes — connect in Settings, then create the bot.',
      })),
    });
    renderSetup();
    await walkToReady(bridge);
    // No settings to open from the setup: the connection page comes back,
    // marked as a connection error rather than quoting the settings.
    expect(await screen.findByText(/Connect your Hermes/)).toBeTruthy();
    expect(
      screen.getByText('Not connected to Hermes — reconnect to continue.'),
    ).toBeTruthy();
    expect(screen.queryByText(/settings/i)).toBeNull();
    expect(screen.queryByText(/You're all set/)).toBeNull();
  });

  it('clears the wait when the gateway is serving the bot', async () => {
    let ready: ((event: { name: string; served: boolean }) => void) | undefined;
    const bridge = makeBridge({
      createBot: vi.fn(async () => ({
        ok: true,
        name: 'nova',
        title: 'Nova',
        color: '#e8483f',
        served: false,
      })),
      onBotReady: vi.fn((callback) => {
        ready = callback;
        return () => undefined;
      }),
    });
    renderSetup();
    await walkToReady(bridge);
    expect(
      await screen.findByText('Hermes is starting this bot — it will answer in a moment.'),
    ).toBeTruthy();
    await act(async () => {
      ready?.({ name: 'nova', served: true });
    });
    // The wait is over: the notice leaves quietly, the bot stays, and the
    // button stops saying "anyway".
    await waitFor(() =>
      expect(
        screen.queryByText('Hermes is starting this bot — it will answer in a moment.'),
      ).toBeNull(),
    );
    expect(screen.getByText('Nova')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Start talking' }),
    ).toBeEnabled();
  });

  it('says when the gateway still does not serve the bot', async () => {
    let ready: ((event: { name: string; served: boolean }) => void) | undefined;
    const bridge = makeBridge({
      createBot: vi.fn(async () => ({
        ok: true,
        name: 'nova',
        title: 'Nova',
        color: '#e8483f',
        served: false,
      })),
      onBotReady: vi.fn((callback) => {
        ready = callback;
        return () => undefined;
      }),
    });
    renderSetup();
    await walkToReady(bridge);
    await act(async () => {
      ready?.({ name: 'nova', served: false });
    });
    expect(
      await screen.findByText(/not serving it yet/),
    ).toBeTruthy();
  });

  it('turns the page the instant the colour is picked', async () => {
    let resolveBot!: (value: unknown) => void;
    const bridge = makeBridge({
      createBot: vi.fn(
        () =>
          new Promise((resolve) => {
            resolveBot = resolve;
          }),
      ),
    });
    const { container } = renderSetup();
    await walkToBot(bridge);
    await userEvent.type(screen.getByLabelText('Its name'), 'Nova');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByText(/What shape\?/);
    await userEvent.click(screen.getByLabelText('Hexagon'));
    await screen.findByText(/What colour\?/);
    await userEvent.click(screen.getByLabelText('Amber'));
    // The page turns before the host answers: the picked bot is already
    // there — Nova in Amber, not the colour from before the click — and the
    // making state lives on the button alone.
    expect(await screen.findByText(/You're all set/)).toBeTruthy();
    expect(screen.getByText('Nova')).toBeTruthy();
    expect(
      (container.querySelector('.onboarding') as HTMLElement).style.getPropertyValue(
        '--actor-color',
      ),
    ).toBe('#e0b34e');
    expect(screen.queryByText(/Making your bot/)).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Making the bot…' }),
    ).toBeDisabled();
    await act(async () => {
      resolveBot({
        ok: true,
        name: 'nova',
        title: 'Nova',
        color: '#e8483f',
        served: true,
      });
    });
    expect(await screen.findByText('Nova')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Start talking' }),
    ).toBeEnabled();
  });

  it('shows the next button again when the person comes back', async () => {
    const bridge = makeBridge();
    renderSetup();
    await walkToReady(bridge);
    // The bot is made: the pages that pick a shape or a colour have nothing
    // left to say, and the person can go back to correct what was made.
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText(/What colour\?/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue' })).not.toBeDisabled();
  });

  it('tells the host when the colour is corrected', async () => {
    const bridge = makeBridge();
    renderSetup();
    await walkToReady(bridge);
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    await screen.findByText(/What colour\?/);
    await userEvent.click(screen.getByLabelText('Red'));
    // The bot wears the colour the person chose the second time.
    await waitFor(() =>
      expect(bridge.updateBot).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'nova', color: '#e8483f' }),
      ),
    );
  });

  it('tells the host when the name is corrected', async () => {
    const bridge = makeBridge();
    renderSetup();
    await walkToReady(bridge);
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    await screen.findByText(/What is it called\?/);
    const field = screen.getByLabelText('Its name');
    await userEvent.clear(field);
    await userEvent.type(field, 'Bob');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    // The name the person chose is the title the bot answers to.
    await waitFor(() =>
      expect(bridge.updateBot).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'nova', title: 'Bob' }),
      ),
    );
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
    await walkToReady(bridge);
    expect(await screen.findByText('Nova')).toBeTruthy();
  });

  it('finishes the setup and remembers that it was done', async () => {
    const bridge = makeBridge();
    const { onFinish, onDismiss } = renderSetup();
    await walkToReady(bridge);
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
      container.querySelector('.mood-bloub mask path')?.getAttribute('d');

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
    await walkToReady(bridge);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Start talking' }),
    );
    await waitFor(() => expect(onFinish).toHaveBeenCalled());
  });

  it('explains a missing key instead of repeating the shell', async () => {
    const bridge = makeBridge({
      importKey: vi.fn(async () => ({
        ok: false,
        reason: 'no-key',
        error: 'API_SERVER_KEY not found in ~/.hermes/.env',
      })),
    });
    renderSetup();
    await userEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await chooseMode('local');
    expect(await screen.findByText("Hermes' API server is off.")).toBeTruthy();
    // The command that fixes it is on the page, not a file to edit by hand.
    expect(
      screen.getByText(/hermes config set API_SERVER_KEY/),
    ).toBeTruthy();
    expect(screen.getByText(/hermes gateway restart/)).toBeTruthy();
    // What the shell said is replaced, not repeated under the answer.
    expect(screen.queryByText(/API_SERVER_KEY not found/)).toBeNull();
    expect(bridge.importKey).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'local' }),
    );
  });

  it('says what the SSH cannot do, and keeps its words behind Details', async () => {
    makeBridge({
      importKey: vi.fn(async () => ({
        ok: false,
        reason: 'unreadable',
        error: 'Permission denied (publickey)',
        details: 'sign_and_send_pubkey: signing failed for ED25519-SK',
      })),
    });
    renderSetup();
    await userEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await userEvent.click(await screen.findByRole('button', { name: /jetson/ }));
    expect(
      await screen.findByText('The key could not be read from jetson.'),
    ).toBeTruthy();
    expect(screen.getByText('Details')).toBeTruthy();
    expect(screen.getByText(/sign_and_send_pubkey/)).toBeTruthy();
  });

  it('says the API server is off, not that Hermes is missing', async () => {
    makeBridge({
      test: vi.fn(async () => ({
        state: 'error',
        message: 'Nothing is listening on that port',
        reason: 'api-server-off',
      })),
    });
    renderSetup();
    await userEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await chooseMode('local');
    expect(
      await screen.findByText(
        'Hermes is here, but its API server is not listening on 127.0.0.1:8642.',
      ),
    ).toBeTruthy();
    expect(screen.getByText(/hermes gateway restart/)).toBeTruthy();
  });
});
