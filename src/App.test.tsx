import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { ModelPrefsProvider } from './modelPrefs';

/** A bridge that answers everything the app asks, and remembers what it was told. */
function makeBridge(overrides: Record<string, unknown> = {}) {
  const bridge = {
    profiles: vi.fn(async () => ({
      ok: true,
      source: 'gateway',
      profiles: [
        { name: 'bob', title: 'Bob', color: '#e8483f', shape: 'galet' },
      ],
      primary: { title: 'Chief of Staff', color: '#8b5cf6', shape: 'cercle' },
    })),
    sessions: vi.fn(async () => ({
      ok: true,
      sessions: [
        {
          id: 'sess-bob',
          title: 'Bob',
          messageCount: 2,
          lastActive: 10,
          archived: false,
        },
      ],
    })),
    messages: vi.fn(async () => ({
      ok: true,
      messages: [
        { role: 'user', content: 'Hello', timestamp: 1 },
        { role: 'assistant', content: 'Hi there', timestamp: 2 },
      ],
    })),
    status: vi.fn(async () => ({ state: 'connected', version: '0.21.5' })),
    onStatus: vi.fn(() => () => undefined),
    sendChat: vi.fn(
      async (_payload: { message: string; sessionId: string }) => ({
        ok: true,
        text: 'The answer',
      }),
    ),
    createSession: vi.fn(async () => ({ ok: true, sessionId: 'sess-new' })),
    cancelChat: vi.fn(async () => ({ ok: true })),
    models: vi.fn(async () => ({
      ok: true,
      current: 'muse',
      currentProvider: 'opencode-go',
      models: [
        {
          model: 'muse',
          provider: 'opencode-go',
          providerName: 'OpenCode',
          current: true,
        },
      ],
    })),
    createBot: vi.fn(async () => ({
      ok: true,
      name: 'nova',
      title: 'Nova',
      color: '#e8483f',
    })),
    updateBot: vi.fn(
      async (_payload: { name: string; title?: string; shape?: string }) => ({
        ok: true,
      }),
    ),
    deleteBot: vi.fn(async () => ({ ok: true })),
    deleteSession: vi.fn(async () => ({ ok: true })),
    renameSession: vi.fn(async () => ({ ok: true })),
    uploadAttachment: vi.fn(async () => ({
      ok: true,
      path: '/home/jules/file.txt',
    })),
    transcribeVoice: vi.fn(async () => ({ ok: true, transcript: 'spoken words' })),
    prefs: vi.fn(async () => ({ ok: true, prefs: {} })),
    savePrefs: vi.fn(async () => ({ ok: true })),
    getSettings: vi.fn(async () => ({
      sshHost: 'my-host',
      apiPort: 8642,
      localPort: 18742,
      autoConnect: true,
      hasKey: true,
    })),
    saveSettings: vi.fn(async () => ({ ok: true })),
    importKey: vi.fn(async () => ({ ok: true, keyLength: 64 })),
    test: vi.fn(async () => ({ state: 'connected' })),
    connect: vi.fn(async () => ({ state: 'connected' })),
    disconnect: vi.fn(async () => ({ state: 'disconnected' })),
    ...overrides,
  };
  (window as unknown as { hermes: unknown }).hermes = bridge;
  return bridge;
}

async function renderApp(bridge: Record<string, unknown>) {
  const view = render(
    <ModelPrefsProvider>
      <App />
    </ModelPrefsProvider>,
  );
  await act(async () => {
    await Promise.resolve();
  });
  await waitFor(() => expect(bridge.profiles).toHaveBeenCalled());
  return view;
}

describe('the app', () => {
  it('lists the bots the server serves', async () => {
    const bridge = makeBridge();
    await renderApp(bridge);
    expect(screen.getByText('Bob')).toBeTruthy();
    expect(screen.getAllByText('Chief of Staff').length).toBeGreaterThan(0);
  });

  it('says when the server cannot be reached', async () => {
    const bridge = makeBridge({
      profiles: vi.fn(async () => ({ ok: false, error: 'no route to host' })),
    });
    await renderApp(bridge);
    expect(await screen.findByText(/no route to host/)).toBeTruthy();
  });

  it('reads the conversation back from the server', async () => {
    const bridge = makeBridge();
    await renderApp(bridge);
    await userEvent.click(screen.getByText('Bob'));
    await waitFor(() => expect(bridge.messages).toHaveBeenCalled());
    expect(await screen.findByText('Hello')).toBeTruthy();
    expect(screen.getAllByText('Hi there').length).toBeGreaterThan(0);
  });

  it('sends what the person wrote', async () => {
    const bridge = makeBridge();
    await renderApp(bridge);
    const composer = screen.getByLabelText(/Message/);
    await userEvent.type(composer, 'Hello there');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(bridge.sendChat).toHaveBeenCalled());
    const call = bridge.sendChat.mock.calls[0]?.[0];
    expect(call?.message).toContain('Hello there');
  });

  it('says what went wrong when the bot cannot answer', async () => {
    const bridge = makeBridge({
      sendChat: vi.fn(async () => ({ ok: false, error: 'the key was refused' })),
    });
    await renderApp(bridge);
    const composer = screen.getByLabelText(/Message/);
    await userEvent.type(composer, 'Hello');
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByText('the key was refused')).toBeTruthy();
  });

  it('opens the settings', async () => {
    const bridge = makeBridge();
    await renderApp(bridge);
    await userEvent.click(screen.getByLabelText('Settings'));
    expect((await screen.findAllByText('Connection')).length).toBeGreaterThan(0);
  });

  it('opens the dialog that creates a bot', async () => {
    const bridge = makeBridge();
    await renderApp(bridge);
    await userEvent.click(screen.getByLabelText('Create a bot or group'));
    expect(await screen.findByText('New agent')).toBeTruthy();
  });

  it('opens the menu of a conversation', async () => {
    const bridge = makeBridge();
    await renderApp(bridge);
    const row = screen.getByText('Bob').closest('button');
    await userEvent.pointer({ keys: '[MouseRight]', target: row as Element });
    expect(await screen.findByText('Delete bot')).toBeTruthy();
  });

  it('filters the agents as the person searches', async () => {
    const bridge = makeBridge();
    await renderApp(bridge);
    const search = screen.getByLabelText('Search agents');
    await userEvent.type(search, 'zzz');
    expect(await screen.findByText('No agents found')).toBeTruthy();
  });
});

describe('the conversation', () => {
  it('renames the bot and tells the server', async () => {
    const bridge = makeBridge();
    await renderApp(bridge);
    await userEvent.click(screen.getByText('Bob'));
    await userEvent.click(screen.getByRole('button', { name: 'Bob' }));
    const input = screen.getByLabelText('Agent name');
    await userEvent.clear(input);
    await userEvent.type(input, 'Bobby');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(bridge.updateBot).toHaveBeenCalled());
    expect(bridge.updateBot.mock.calls[0]?.[0]).toMatchObject({
      title: 'Bobby',
    });
  });

  it('changes the face of the bot and tells the server', async () => {
    const bridge = makeBridge();
    await renderApp(bridge);
    await userEvent.click(screen.getByText('Bob'));
    await userEvent.click(screen.getByLabelText('Change logo'));
    await userEvent.click(await screen.findByLabelText('Squircle'));
    await waitFor(() => expect(bridge.updateBot).toHaveBeenCalled());
    expect(bridge.updateBot.mock.calls[0]?.[0]).toMatchObject({
      shape: 'squircle',
    });
  });

  it('opens the menu of a conversation and pins it', async () => {
    const bridge = makeBridge();
    await renderApp(bridge);
    const row = screen.getByText('Bob').closest('button');
    await userEvent.pointer({ keys: '[MouseRight]', target: row as Element });
    await userEvent.click(await screen.findByText('Pin'));
    expect(await screen.findByText('Bob')).toBeTruthy();
  });

  it('deletes a bot and tells the server', async () => {
    const bridge = makeBridge();
    await renderApp(bridge);
    const row = screen.getByText('Bob').closest('button');
    await userEvent.pointer({ keys: '[MouseRight]', target: row as Element });
    await userEvent.click(await screen.findByText('Delete bot'));
    await waitFor(() => expect(bridge.deleteBot).toHaveBeenCalled());
  });

  it('opens the tapbacks of a message', async () => {
    const bridge = makeBridge({
      messages: vi.fn(async () => ({
        ok: true,
        messages: [
          { role: 'user', content: 'Hello', timestamp: 1 },
          { role: 'assistant', content: '[[react:👍]]Hi there', timestamp: 2 },
        ],
      })),
    });
    await renderApp(bridge);
    await userEvent.click(screen.getByText('Bob'));
    await waitFor(() => expect(bridge.messages).toHaveBeenCalled());
    const pill = await screen.findByLabelText('Bob a réagi 👍');
    await userEvent.click(pill);
    expect(await screen.findByText('Réactions')).toBeTruthy();
  });

  it('picks the model the person chose', async () => {
    const bridge = makeBridge();
    await renderApp(bridge);
    await userEvent.click(screen.getByText('Bob'));
    await userEvent.click(document.querySelector('.model-chip') as Element);
    await waitFor(() => expect(bridge.models).toHaveBeenCalled());
  });
});
