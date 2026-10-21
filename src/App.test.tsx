import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
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
        { name: 'alice', title: 'Alice', color: '#4f9d8f', shape: 'cercle' },
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

describe('a group', () => {
  const groupSessions = [
    {
      id: 'sess-chief',
      title: 'Group · Crew · Chief of Staff',
      messageCount: 2,
      lastActive: 20,
      archived: false,
    },
    {
      id: 'sess-bob',
      title: 'Group · Crew · Bob',
      messageCount: 2,
      lastActive: 21,
      archived: false,
    },
  ];

  it('is rebuilt from the conversations of its members', async () => {
    const bridge = makeBridge({
      sessions: vi.fn(async () => ({ ok: true, sessions: groupSessions })),
    });
    await renderApp(bridge);
    expect(await screen.findByText('Crew')).toBeTruthy();
  });

  it('asks for a bot by name when the person writes @', async () => {
    const bridge = makeBridge({
      sessions: vi.fn(async () => ({ ok: true, sessions: groupSessions })),
    });
    await renderApp(bridge);
    await userEvent.click(await screen.findByText('Crew'));
    const composer = await screen.findByLabelText(/Message/);
    await userEvent.type(composer, '@');
    expect(await screen.findByText('@Bob')).toBeTruthy();
  });

  it('asks every member and keeps the answers', async () => {
    const bridge = makeBridge({
      sessions: vi.fn(async () => ({ ok: true, sessions: groupSessions })),
      messages: vi.fn(async () => ({
        ok: true,
        messages: [
          {
            role: 'user',
            content: '@You: Hello',
            timestamp: 1,
          },
          { role: 'assistant', content: 'Hi', timestamp: 2 },
        ],
      })),
      createSession: vi.fn(async () => ({ ok: true, sessionId: 'sess-new' })),
    });
    await renderApp(bridge);
    await userEvent.click(await screen.findByText('Crew'));
    const composer = await screen.findByLabelText(/Message/);
    await userEvent.type(composer, 'Hello crew');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(bridge.sendChat).toHaveBeenCalled());
  });
});

describe('the files and the voice', () => {
  it('copies an attached file to the server', async () => {
    const bridge = makeBridge();
    await renderApp(bridge);
    const input = document.querySelector(
      'input[type=file]',
    ) as HTMLInputElement;
    const file = new File(['hello'], 'note.txt', { type: 'text/plain' });
    await userEvent.upload(input, file);
    await waitFor(() => expect(bridge.uploadAttachment).toHaveBeenCalled());
  });

  it('writes down what the person says', async () => {
    const bridge = makeBridge();
    vi.stubGlobal('MediaRecorder', class {
      static isTypeSupported = () => true;
      state = 'recording';
      mimeType = 'audio/webm';
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      start = vi.fn();
      stop = vi.fn(() => {
        this.onstop?.();
      });
    });
    vi.stubGlobal('navigator', {
      ...navigator,
      mediaDevices: {
        getUserMedia: vi.fn(async () => ({
          getTracks: () => [{ stop: () => undefined }],
        })),
      },
    });
    await renderApp(bridge);
    await userEvent.click(screen.getByLabelText('Voice message'));
    await waitFor(() =>
      expect(document.querySelector('.mic-button')?.className).toContain(
        'is-listening',
      ),
    );
    await userEvent.click(screen.getByLabelText('Voice message'));
    await waitFor(() => expect(bridge.transcribeVoice).toHaveBeenCalled());
  });
});

describe('creating a bot', () => {
  it('asks the server for a profile', async () => {
    const bridge = makeBridge();
    await renderApp(bridge);
    await userEvent.click(screen.getByLabelText('Create a bot or group'));
    await userEvent.type(await screen.findByLabelText(/Bot name/i), 'Nova');
    await userEvent.click(
      screen.getByText('Create bot', { selector: 'button' }),
    );
    await waitFor(() => expect(bridge.createBot).toHaveBeenCalled());
  });
});

describe('a round in a group', () => {
  const groupSessions = [
    {
      id: 'sess-chief',
      title: 'Group · Crew · Chief of Staff',
      messageCount: 0,
      lastActive: 20,
      archived: false,
    },
    {
      id: 'sess-bob',
      title: 'Group · Crew · Bob',
      messageCount: 0,
      lastActive: 21,
      archived: false,
    },
  ];

  it('asks every member, and keeps the answers', async () => {
    const bridge = makeBridge({
      sessions: vi.fn(async () => ({ ok: true, sessions: groupSessions })),
      messages: vi.fn(async () => ({ ok: true, messages: [] })),
      sendChat: vi.fn(async (payload: { profile?: string }) =>
        payload.profile === 'bob'
          ? { ok: true, text: '[[silent]]' }
          : { ok: true, text: 'The chief has the floor.' },
      ),
    });
    await renderApp(bridge);
    await userEvent.click(await screen.findByText('Crew'));
    const composer = await screen.findByLabelText(/Message/);
    await userEvent.type(composer, 'Who has the floor?');
    await userEvent.keyboard('{Enter}');
    await waitFor(() =>
      expect(screen.getAllByText('The chief has the floor.').length).toBeGreaterThan(
        0,
      ),
    );
    // The member that stayed silent is acknowledged with a tapback.
    expect(screen.getAllByText('Chief of Staff').length).toBeGreaterThan(0);
  });

  it('says when a member cannot join the group', async () => {
    const bridge = makeBridge({
      sessions: vi.fn(async () => ({ ok: true, sessions: [] })),
      messages: vi.fn(async () => ({ ok: true, messages: [] })),
      createSession: vi.fn(async () => ({
        ok: false,
        error: 'the profile is gone',
      })),
      sendChat: vi.fn(async () => ({ ok: true, text: 'Hi' })),
    });
    await renderApp(bridge);
    // A group built here has no conversation on the server yet.
    await userEvent.click(screen.getByLabelText('Create a bot or group'));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('tab', { name: 'Group' }));
    await userEvent.type(
      within(dialog).getByLabelText(/Group name/i),
      'The crew',
    );
    await userEvent.click(within(dialog).getByText('Bob'));
    await userEvent.click(within(dialog).getByText('Alice'));
    await userEvent.click(
      within(dialog).getByText('Create group', { selector: 'button' }),
    );
    const crew = (await screen.findAllByText('The crew'))[0];
    await userEvent.click(crew);
    const composer = await screen.findByLabelText(/Message/);
    await userEvent.type(composer, 'Hello');
    await userEvent.keyboard('{Enter}');
    expect(
      (await screen.findAllByText(/could not join the group/)).length,
    ).toBeGreaterThan(0);
  });

  it('says when a member cannot answer', async () => {
    const bridge = makeBridge({
      sessions: vi.fn(async () => ({ ok: true, sessions: groupSessions })),
      messages: vi.fn(async () => ({ ok: true, messages: [] })),
      sendChat: vi.fn(async () => ({ ok: false, error: 'the key was refused' })),
    });
    await renderApp(bridge);
    await userEvent.click(await screen.findByText('Crew'));
    const composer = await screen.findByLabelText(/Message/);
    await userEvent.type(composer, 'Hello');
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByText(/could not answer/)).toBeTruthy();
  });
});
