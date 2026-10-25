import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
      async (_payload: { message: string; sessionId: string; requestId: string }) => ({
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
      mode: 'ssh',
      configured: true,
      sshHost: 'my-host',
      apiPort: 8642,
      localPort: 18742,
      autoConnect: true,
      hasKey: true,
      onboardingCompleted: false,
    })),
    saveSettings: vi.fn(async () => ({ ok: true })),
    setOnboarding: vi.fn(async () => ({ ok: true })),
    sshHosts: vi.fn(async () => ({ ok: true, hosts: ['my-host'] })),
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
    await userEvent.click(screen.getByRole('button', { name: /settings/i }));
    expect((await screen.findAllByText('Connection')).length).toBeGreaterThan(0);
  });

  it('opens the connectors from the dock of the sidebar', async () => {
    const bridge = makeBridge();
    await renderApp(bridge);
    await userEvent.click(screen.getByRole('button', { name: 'Connectors' }));
    expect(
      await screen.findByRole('heading', { name: 'Connectors' }),
    ).toBeTruthy();
  });

  it('opens the settings from the pill, and says what it is', async () => {
    const bridge = makeBridge();
    await renderApp(bridge);
    const pill = await screen.findByRole('button', { name: 'Settings' });
    expect(pill.textContent).toContain('Settings');
    await userEvent.click(pill);
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

  it('carries the bot the setup made into the sidebar', async () => {
    const bridge = makeBridge({
      // A machine that knows nothing yet: the setup asks for everything.
      getSettings: vi.fn(async () => ({
        mode: 'local',
        configured: false,
        sshHost: '',
        apiPort: 8642,
        localPort: 18742,
        autoConnect: true,
        hasKey: false,
        onboardingCompleted: false,
      })),
    });
    await renderApp(bridge);
    // The setup opens, the scan finds the Hermes on this Mac, and the person
    // makes their first bot.
    await userEvent.click(await screen.findByRole('button', { name: 'Begin' }));
    await userEvent.click(
      await screen.findByRole('button', { name: /Continue|Test the connection/ }),
    );
    await userEvent.type(await screen.findByLabelText('Its name'), 'Nova');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.click(await screen.findByLabelText('Hexagon'));
    await userEvent.click(await screen.findByLabelText('Amber'));
    await userEvent.click(
      await screen.findByRole('button', { name: 'Start talking' }),
    );
    // The bot the person made is in the sidebar, even though the server does
    // not list it yet: the app carries it until the list catches up.
    expect((await screen.findAllByText('Nova')).length).toBeGreaterThan(0);
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

describe('what happens while the bot writes', () => {
  it('shows the words as they arrive', async () => {
    let onDelta: ((payload: { requestId: string; text: string }) => void) | null =
      null;
    const bridge = makeBridge({
      onChatDelta: vi.fn((callback) => {
        onDelta = callback;
        return () => undefined;
      }),
      sendChat: vi.fn(
        async () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({ ok: true, text: 'The whole answer' }), 50);
          }),
      ),
    });
    await renderApp(bridge);
    await userEvent.click(screen.getByText('Bob'));
    const composer = await screen.findByLabelText(/Message/);
    await userEvent.type(composer, 'Tell me');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(onDelta).not.toBeNull());
    await act(async () => {
      onDelta?.({ requestId: 'any', text: 'The whole answer' });
    });
    expect((await screen.findAllByText('The whole answer')).length).toBeGreaterThan(
      0,
    );
  });

  it('falls back to a free model when the picked one is out of quota', async () => {
    const bridge = makeBridge({
      sendChat: vi
        .fn()
        .mockResolvedValueOnce({ ok: false, error: 'usage limit reached' })
        .mockResolvedValueOnce({ ok: true, text: 'Answered anyway' }),
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
          {
            model: 'grok-free',
            provider: 'opencode-go',
            providerName: 'OpenCode',
            current: false,
          },
        ],
      })),
    });
    await renderApp(bridge);
    await userEvent.click(screen.getByText('Bob'));
    const composer = await screen.findByLabelText(/Message/);
    await userEvent.type(composer, 'Tell me');
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByText(/out of quota/)).toBeTruthy();
  });
});

describe('the way around', () => {
  it('opens and closes the list of the agents', async () => {
    const bridge = makeBridge();
    await renderApp(bridge);
    await userEvent.click(screen.getByLabelText('Open agents'));
    expect(await screen.findByLabelText('Close agents')).toBeTruthy();
    await userEvent.click(screen.getByLabelText('Close agents'));
  });

  it('marks a conversation as unread', async () => {
    const bridge = makeBridge();
    await renderApp(bridge);
    const row = screen.getByText('Bob').closest('button');
    await userEvent.pointer({ keys: '[MouseRight]', target: row as Element });
    await userEvent.click(await screen.findByText('Mark as unread'));
    // The row now carries the unread mark.
    expect(
      document.querySelector('.thread-row.is-unread'),
    ).toBeTruthy();
  });

  it('opens the editor of a bot', async () => {
    const bridge = makeBridge();
    await renderApp(bridge);
    const row = screen.getByText('Bob').closest('button');
    await userEvent.pointer({ keys: '[MouseRight]', target: row as Element });
    await userEvent.click(await screen.findByText('Edit bot'));
    expect(await screen.findByText('Save changes')).toBeTruthy();
  });
});

describe('the roster of a group', () => {
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

  it('puts the name of the bot in the composer', async () => {
    const bridge = makeBridge({
      sessions: vi.fn(async () => ({ ok: true, sessions: groupSessions })),
      messages: vi.fn(async () => ({ ok: true, messages: [] })),
    });
    await renderApp(bridge);
    await userEvent.click(await screen.findByText('Crew'));
    const composer = await screen.findByLabelText(/Message/);
    await userEvent.type(composer, 'hey @');
    const option = await screen.findByText('@Bob');
    await userEvent.click(option);
    expect((composer as HTMLTextAreaElement).value).toContain('@Bob');
  });

  it('shows the answer of a member as it arrives', async () => {
    const bridge = makeBridge({
      sessions: vi.fn(async () => ({ ok: true, sessions: groupSessions })),
      messages: vi.fn(async () => ({ ok: true, messages: [] })),
      sendChat: vi.fn(
        async () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({ ok: true, text: 'A line from the crew' }), 40);
          }),
      ),
    });
    await renderApp(bridge);
    await userEvent.click(await screen.findByText('Crew'));
    const composer = await screen.findByLabelText(/Message/);
    await userEvent.type(composer, 'Hello');
    await userEvent.keyboard('{Enter}');
    expect(
      (await screen.findAllByText('A line from the crew')).length,
    ).toBeGreaterThan(0);
  });

  it('takes a bot out of the groups it belonged to', async () => {
    const bridge = makeBridge({
      sessions: vi.fn(async () => ({ ok: true, sessions: groupSessions })),
      messages: vi.fn(async () => ({ ok: true, messages: [] })),
    });
    await renderApp(bridge);
    const row = screen.getByText('Bob').closest('button');
    await userEvent.pointer({ keys: '[MouseRight]', target: row as Element });
    await userEvent.click(await screen.findByText('Delete bot'));
    await waitFor(() => expect(bridge.deleteBot).toHaveBeenCalled());
    // The bot leaves the sidebar.
    await waitFor(() =>
      expect(screen.queryAllByText('Bob').length).toBeLessThan(2),
    );
  });

  it('keeps the name of a bot in step with the groups it is in', async () => {
    const bridge = makeBridge({
      sessions: vi.fn(async () => ({ ok: true, sessions: groupSessions })),
      messages: vi.fn(async () => ({ ok: true, messages: [] })),
    });
    await renderApp(bridge);
    const row = screen.getByText('Bob').closest('button');
    await userEvent.pointer({ keys: '[MouseRight]', target: row as Element });
    await userEvent.click(await screen.findByText('Edit bot'));
    const input = screen.getByDisplayValue('Bob');
    await userEvent.clear(input);
    await userEvent.type(input, 'Bobby');
    await userEvent.click(screen.getByText('Save changes'));
    expect((await screen.findAllByText('Bobby')).length).toBeGreaterThan(0);
  });
});

describe('the keyboard', () => {
  it('opens the search with the K', async () => {
    const bridge = makeBridge();
    await renderApp(bridge);
    await userEvent.keyboard('{Meta>}k{/Meta}');
    expect(document.activeElement?.getAttribute('aria-label')).toBe(
      'Search agents',
    );
  });

  it('opens the dialog that creates a bot with the N', async () => {
    const bridge = makeBridge();
    await renderApp(bridge);
    await userEvent.keyboard('{Meta>}n{/Meta}');
    expect(await screen.findByText('New agent')).toBeTruthy();
  });

  it('opens the settings with the comma', async () => {
    const bridge = makeBridge();
    await renderApp(bridge);
    await userEvent.keyboard('{Meta>},{/Meta}');
    expect((await screen.findAllByText('Connection')).length).toBeGreaterThan(0);
  });
});

describe('a message that replaces another one', () => {
  it('carries the replaced text with it', async () => {
    const bridge = makeBridge({
      sendChat: vi.fn(
        async () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({ ok: true, text: 'First answer' }), 200);
          }),
      ),
    });
    await renderApp(bridge);
    await userEvent.click(screen.getByText('Bob'));
    const composer = await screen.findByLabelText(/Message/);
    await userEvent.type(composer, 'First question');
    await userEvent.keyboard('{Enter}');
    await userEvent.type(composer, 'Second question');
    await userEvent.keyboard('{Enter}');
    await waitFor(() =>
      expect(
        bridge.sendChat.mock.calls.some((call) =>
          String(call[0]?.message ?? '').includes('First question'),
        ),
      ).toBe(true),
    );
  });
});

describe('a mention in a group', () => {
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

  it('stops the bot that was mentioned, and hands it the floor', async () => {
    let releaseBob: (() => void) | null = null;
    const bridge = makeBridge({
      sessions: vi.fn(async () => ({ ok: true, sessions: groupSessions })),
      messages: vi.fn(async () => ({ ok: true, messages: [] })),
      sendChat: vi.fn(async (payload: { profile?: string }) => {
        if (payload.profile === 'bob') {
          // The bot that is mentioned is still writing.
          await new Promise<void>((resolve) => {
            releaseBob = resolve;
          });
          return { ok: true, text: 'Bob had the floor' };
        }
        return { ok: true, text: '@Bob has the floor' };
      }),
    });
    await renderApp(bridge);
    await userEvent.click(await screen.findByText('Crew'));
    const composer = await screen.findByLabelText(/Message/);
    await userEvent.type(composer, 'Who has the floor?');
    await userEvent.keyboard('{Enter}');
    await waitFor(() =>
      expect(screen.getAllByText('@Bob has the floor').length).toBeGreaterThan(0),
    );
    await act(async () => {
      releaseBob?.();
    });
  });

  it('notes the silence of a member that was named', async () => {
    const bridge = makeBridge({
      sessions: vi.fn(async () => ({ ok: true, sessions: groupSessions })),
      messages: vi.fn(async () => ({ ok: true, messages: [] })),
      sendChat: vi.fn(async () => ({ ok: true, text: '[[silent]]' })),
    });
    await renderApp(bridge);
    await userEvent.click(await screen.findByText('Crew'));
    const composer = await screen.findByLabelText(/Message/);
    await userEvent.type(composer, '@Bob your turn');
    await userEvent.keyboard('{Enter}');
    expect(
      (await screen.findAllByText(/stayed silent/)).length,
    ).toBeGreaterThan(0);
  });
});

describe('a group that writes while it answers', () => {
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

  it('shows the words of every member as they arrive', async () => {
    let onDelta: ((payload: { requestId: string; text: string }) => void) | null =
      null;
    const bridge = makeBridge({
      sessions: vi.fn(async () => ({ ok: true, sessions: groupSessions })),
      messages: vi.fn(async () => ({ ok: true, messages: [] })),
      onChatDelta: vi.fn((callback) => {
        onDelta = callback;
        return () => undefined;
      }),
      sendChat: vi.fn(
        async () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({ ok: true, text: 'A line from the crew' }), 300);
          }),
      ),
    });
    await renderApp(bridge);
    await userEvent.click(await screen.findByText('Crew'));
    const composer = await screen.findByLabelText(/Message/);
    await userEvent.type(composer, 'Hello');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(onDelta).not.toBeNull());
    const requestId = bridge.sendChat.mock.calls[0]?.[0]?.requestId;
    await act(async () => {
      onDelta?.({ requestId: requestId ?? 'any', text: 'Half a line' });
    });
    expect(
      (await screen.findAllByText(/Half a line/)).length,
    ).toBeGreaterThan(0);
  });

  it('says a member could not answer when the call throws', async () => {
    const bridge = makeBridge({
      sessions: vi.fn(async () => ({ ok: true, sessions: groupSessions })),
      messages: vi.fn(async () => ({ ok: true, messages: [] })),
      sendChat: vi.fn(async () => {
        throw new Error('the socket died');
      }),
    });
    await renderApp(bridge);
    await userEvent.click(await screen.findByText('Crew'));
    const composer = await screen.findByLabelText(/Message/);
    await userEvent.type(composer, 'Hello');
    await userEvent.keyboard('{Enter}');
    expect((await screen.findAllByText(/could not answer/)).length).toBeGreaterThan(0);
  });

  it('falls back to a free model when a member is out of quota', async () => {
    const bridge = makeBridge({
      sessions: vi.fn(async () => ({ ok: true, sessions: groupSessions })),
      messages: vi.fn(async () => ({ ok: true, messages: [] })),
      sendChat: vi
        .fn()
        .mockResolvedValueOnce({ ok: false, error: 'usage limit reached' })
        .mockResolvedValueOnce({ ok: true, text: 'Answered anyway' }),
      models: vi.fn(async () => ({
        ok: true,
        current: 'muse',
        currentProvider: 'opencode-go',
        models: [
          {
            model: 'grok-free',
            provider: 'opencode-go',
            providerName: 'OpenCode',
            current: false,
          },
        ],
      })),
    });
    await renderApp(bridge);
    await userEvent.click(await screen.findByText('Crew'));
    const composer = await screen.findByLabelText(/Message/);
    await userEvent.type(composer, 'Hello');
    await userEvent.keyboard('{Enter}');
    expect((await screen.findAllByText(/out of quota/)).length).toBeGreaterThan(0);
  });
});

describe('when things go wrong', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('says the server did not answer when a bot takes too long', async () => {
    const bridge = makeBridge({
      createBot: vi.fn(
        async () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({ ok: true }), 80000);
          }),
      ),
    });
    await renderApp(bridge);
    await userEvent.click(screen.getByLabelText('Create a bot or group'));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/Bot name/i), 'Nova');
    await userEvent.click(
      within(dialog).getByText('Create bot', { selector: 'button' }),
    );
    // The dialog gives up rather than spinning for ever.
    await act(async () => {
      vi.advanceTimersByTime(71000);
    });
    expect(
      await screen.findByText(/did not hear back from the server/),
    ).toBeTruthy();
  });

  it('says a file could not be copied', async () => {
    const bridge = makeBridge({
      uploadAttachment: vi.fn(async () => ({
        ok: false,
        error: 'the host said no',
      })),
    });
    await renderApp(bridge);
    const input = document.querySelector(
      'input[type=file]',
    ) as HTMLInputElement;
    await userEvent.upload(
      input,
      new File(['hello'], 'note.txt', { type: 'text/plain' }),
    );
    expect(await screen.findByText('the host said no')).toBeTruthy();
  });

  it('says a bot could not be created', async () => {
    const bridge = makeBridge({
      createBot: vi.fn(async () => ({
        ok: false,
        error: 'the name is taken',
      })),
    });
    await renderApp(bridge);
    await userEvent.click(screen.getByLabelText('Create a bot or group'));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/Bot name/i), 'Nova');
    await userEvent.click(
      within(dialog).getByText('Create bot', { selector: 'button' }),
    );
    expect(await screen.findByText('the name is taken')).toBeTruthy();
  });
});

describe('the keyboard of the group', () => {
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

  it('moves through the roster with the arrows, and takes the name with the tab', async () => {
    const bridge = makeBridge({
      sessions: vi.fn(async () => ({ ok: true, sessions: groupSessions })),
      messages: vi.fn(async () => ({ ok: true, messages: [] })),
    });
    await renderApp(bridge);
    await userEvent.click(await screen.findByText('Crew'));
    const composer = await screen.findByLabelText(/Message/);
    await userEvent.type(composer, '@');
    await screen.findByText('@Bob');
    await userEvent.keyboard('{ArrowDown}');
    await userEvent.keyboard('{Tab}');
    expect((composer as HTMLTextAreaElement).value).toContain('@');
  });

  it('closes the roster with the escape', async () => {
    const bridge = makeBridge({
      sessions: vi.fn(async () => ({ ok: true, sessions: groupSessions })),
      messages: vi.fn(async () => ({ ok: true, messages: [] })),
    });
    await renderApp(bridge);
    await userEvent.click(await screen.findByText('Crew'));
    const composer = await screen.findByLabelText(/Message/);
    await userEvent.type(composer, '@');
    await screen.findByText('@Bob');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByText('@Bob')).toBeNull();
  });
});

describe('the model of a conversation', () => {
  it('is remembered when it is picked', async () => {
    const bridge = makeBridge();
    await renderApp(bridge);
    await userEvent.click(screen.getByText('Bob'));
    await userEvent.click(document.querySelector('.model-chip') as Element);
    await waitFor(() => expect(bridge.models).toHaveBeenCalled());
    const option = (await screen.findAllByText('muse')).pop();
    await userEvent.click(option as Element);
    await waitFor(() => expect(bridge.savePrefs).toHaveBeenCalled());
  });
});

describe('the small things', () => {
  it('shows the size of a file the way it is', async () => {
    const bridge = makeBridge();
    await renderApp(bridge);
    const input = document.querySelector(
      'input[type=file]',
    ) as HTMLInputElement;
    await userEvent.upload(
      input,
      new File(['x'.repeat(2000)], 'small.txt', { type: 'text/plain' }),
    );
    expect(await screen.findByText('2 KB')).toBeTruthy();
  });

  it('shows the size of a big file', async () => {
    const bridge = makeBridge();
    await renderApp(bridge);
    const input = document.querySelector(
      'input[type=file]',
    ) as HTMLInputElement;
    await userEvent.upload(
      input,
      new File(['x'.repeat(3 * 1024 * 1024)], 'big.txt', { type: 'text/plain' }),
    );
    expect(await screen.findByText('3.0 MB')).toBeTruthy();
  });

  it('finds a conversation by what was said in it', async () => {
    const bridge = makeBridge({
      messages: vi.fn(async () => ({
        ok: true,
        messages: [
          { role: 'user', content: 'A question about bananas', timestamp: 1 },
          { role: 'assistant', content: 'An answer', timestamp: 2 },
        ],
      })),
    });
    await renderApp(bridge);
    await userEvent.click(screen.getByText('Bob'));
    await waitFor(() => expect(bridge.messages).toHaveBeenCalled());
    await userEvent.type(screen.getByLabelText('Search agents'), 'bananas');
    expect((await screen.findAllByText('Bob')).length).toBeGreaterThan(0);
  });

  it('tries again when a conversation cannot be read', async () => {
    let attempt = 0;
    const bridge = makeBridge({
      messages: vi.fn(async () => {
        attempt += 1;
        if (attempt === 1) return { ok: false, error: 'the tunnel is down' };
        return {
          ok: true,
          messages: [{ role: 'user', content: 'Hello', timestamp: 1 }],
        };
      }),
    });
    await renderApp(bridge);
    await userEvent.click(screen.getByText('Bob'));
    await waitFor(() => expect(attempt).toBeGreaterThan(1), { timeout: 3000 });
  });
});

describe('the rest of the conversation', () => {
  it('shows the tool the bot is using', async () => {
    let onTool: ((payload: { requestId: string; tool: string }) => void) | null =
      null;
    const bridge = makeBridge({
      onChatDelta: vi.fn(() => () => undefined),
      onChatTool: vi.fn((callback) => {
        onTool = callback;
        return () => undefined;
      }),
      sendChat: vi.fn(
        async () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({ ok: true, text: 'Done' }), 200);
          }),
      ),
    });
    await renderApp(bridge);
    await userEvent.click(screen.getByText('Bob'));
    const composer = await screen.findByLabelText(/Message/);
    await userEvent.type(composer, 'Do it');
    await userEvent.keyboard('{Enter}');
    await waitFor(() =>
      expect(
        (bridge as unknown as { onChatTool: { mock: unknown } }).onChatTool,
      ).toBeTruthy(),
    );
    const requestId = bridge.sendChat.mock.calls[0]?.[0]?.requestId;
    await act(async () => {
      onTool?.({ requestId: requestId ?? 'any', tool: 'terminal' });
    });
    expect((await screen.findAllByText(/terminal/)).length).toBeGreaterThan(0);
  });

  it('closes the editor of the logo with the escape', async () => {
    const bridge = makeBridge();
    await renderApp(bridge);
    await userEvent.click(screen.getByText('Bob'));
    await userEvent.click(screen.getByLabelText('Change logo'));
    await screen.findByLabelText('Circle');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByLabelText('Circle')).toBeNull();
  });

  it('takes an attachment back', async () => {
    const bridge = makeBridge();
    await renderApp(bridge);
    const input = document.querySelector(
      'input[type=file]',
    ) as HTMLInputElement;
    await userEvent.upload(
      input,
      new File(['hello'], 'note.txt', { type: 'text/plain' }),
    );
    await waitFor(() => expect(screen.getByText('note.txt')).toBeTruthy());
    await userEvent.click(screen.getByLabelText('Remove note.txt'));
    await waitFor(() => expect(screen.queryByText('note.txt')).toBeNull());
  });

  it('clears the unread mark when the conversation is opened', async () => {
    const bridge = makeBridge();
    await renderApp(bridge);
    const row = screen.getByText('Bob').closest('button');
    await userEvent.pointer({ keys: '[MouseRight]', target: row as Element });
    await userEvent.click(await screen.findByText('Mark as unread'));
    expect(document.querySelector('.thread-row.is-unread')).toBeTruthy();
    await userEvent.click(screen.getByText('Bob'));
    await waitFor(() =>
      expect(document.querySelector('.thread-row.is-unread')).toBeNull(),
    );
  });

  it('deletes the conversations of a group that is deleted', async () => {
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
    const bridge = makeBridge({
      sessions: vi.fn(async () => ({ ok: true, sessions: groupSessions })),
      messages: vi.fn(async () => ({ ok: true, messages: [] })),
    });
    await renderApp(bridge);
    const row = (await screen.findByText('Crew')).closest('button');
    await userEvent.pointer({ keys: '[MouseRight]', target: row as Element });
    await userEvent.click(await screen.findByText('Delete group'));
    await waitFor(() => expect(bridge.deleteSession).toHaveBeenCalled());
  });
});

describe('the setup', () => {
  it('opens on a machine that has never been told where Hermes lives', async () => {
    const bridge = makeBridge({
      getSettings: vi.fn(async () => ({
        mode: 'local',
        configured: false,
        sshHost: '',
        apiPort: 8642,
        localPort: 18742,
        autoConnect: true,
        hasKey: false,
        onboardingCompleted: false,
      })),
    });
    await renderApp(bridge);
    expect(
      await screen.findByText(/A window onto your agents/),
    ).toBeTruthy();
  });

  it('stays closed on a machine that already knows its host', async () => {
    const bridge = makeBridge({
      getSettings: vi.fn(async () => ({
        mode: 'ssh',
        configured: true,
        sshHost: 'my-host',
        apiPort: 8642,
        localPort: 18742,
        autoConnect: true,
        hasKey: true,
        onboardingCompleted: false,
      })),
    });
    await renderApp(bridge);
    expect(screen.getByText('Bob')).toBeTruthy();
    expect(screen.queryByText(/A window onto your agents/)).toBeNull();
  });

  it('stays closed on a machine that knows Hermes runs here', async () => {
    const bridge = makeBridge({
      getSettings: vi.fn(async () => ({
        mode: 'local',
        configured: true,
        sshHost: '',
        apiPort: 8642,
        localPort: 18742,
        autoConnect: true,
        hasKey: true,
        onboardingCompleted: false,
      })),
    });
    await renderApp(bridge);
    expect(screen.getByText('Bob')).toBeTruthy();
    expect(screen.queryByText(/A window onto your agents/)).toBeNull();
  });

  it('stays closed once the setup has been walked through', async () => {
    const bridge = makeBridge({
      getSettings: vi.fn(async () => ({
        mode: 'local',
        configured: false,
        sshHost: '',
        apiPort: 8642,
        localPort: 18742,
        autoConnect: true,
        hasKey: false,
        onboardingCompleted: true,
      })),
    });
    await renderApp(bridge);
    expect(screen.getByText('Bob')).toBeTruthy();
    expect(screen.queryByText(/A window onto your agents/)).toBeNull();
  });

  it('runs again from the settings', async () => {
    const bridge = makeBridge();
    await renderApp(bridge);
    await userEvent.click(screen.getByRole('button', { name: /settings/i }));
    await userEvent.click(await screen.findByText('Setup'));
    await userEvent.click(
      await screen.findByRole('button', { name: 'Run the setup again' }),
    );
    expect(
      await screen.findByText(/A window onto your agents/),
    ).toBeTruthy();
  });

  it('gives the window back when the person walks away', async () => {
    const bridge = makeBridge({
      getSettings: vi.fn(async () => ({
        mode: 'local',
        configured: false,
        sshHost: '',
        apiPort: 8642,
        localPort: 18742,
        autoConnect: true,
        hasKey: false,
        onboardingCompleted: false,
      })),
    });
    await renderApp(bridge);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Skip' }),
    );
    await waitFor(() =>
      expect(screen.queryByText(/A window onto your agents/)).toBeNull(),
    );
    expect(bridge.setOnboarding).toHaveBeenCalledWith({ completed: true });
  });

  it('gives the window back when the setup is finished', async () => {
    const bridge = makeBridge({
      getSettings: vi.fn(async () => ({
        mode: 'ssh',
        configured: false,
        sshHost: '',
        apiPort: 8642,
        localPort: 18742,
        autoConnect: true,
        hasKey: false,
        onboardingCompleted: false,
      })),
    });
    await renderApp(bridge);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Begin' }),
    );
    // The setup starts on this Mac; the conversation below is over SSH.
    await userEvent.click(screen.getByRole('radio', { name: /Another machine/ }));
    await userEvent.type(screen.getByLabelText('SSH host'), 'hermes-box.local');
    await userEvent.type(screen.getByLabelText('API key'), 'sk-secret');
    await userEvent.click(
      screen.getByRole('button', { name: 'Test the connection' }),
    );
    await waitFor(() => expect(bridge.connect).toHaveBeenCalled());
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.type(await screen.findByLabelText('Its name'), 'Nova');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByText(/What shape/);
    await userEvent.click(screen.getByLabelText('Hexagon'));
    await screen.findByText(/What colour/);
    await userEvent.click(screen.getByLabelText('Amber'));
    await waitFor(() => expect(bridge.createBot).toHaveBeenCalled());
    await userEvent.click(
      await screen.findByRole('button', { name: 'Start talking' }),
    );
    await waitFor(() =>
      expect(screen.queryByText(/A window onto your agents/)).toBeNull(),
    );
    // The setup may have opened the connection: the sidebar is read again.
    expect(await screen.findByText('Bob')).toBeTruthy();
  });
});

describe('a bot that is still connecting', () => {
  it('shows an unserved profile at once with a warming state', async () => {
    const bridge = makeBridge({
      profiles: vi.fn(async () => ({
        ok: true,
        source: 'gateway',
        profiles: [
          { name: 'bob', title: 'Bob', color: '#e8483f', shape: 'galet' },
          { name: 'nova', title: 'Nova', color: '#e8483f', shape: 'cercle', served: false },
        ],
        primary: { title: 'Chief of Staff', color: '#8b5cf6', shape: 'cercle' },
      })),
    });
    await renderApp(bridge);
    expect(await screen.findByText('Nova')).toBeTruthy();
    expect(await screen.findByText('Connecting…')).toBeTruthy();
  });

  it('opens a loading screen with retry and remove actions', async () => {
    const bridge = makeBridge({
      profiles: vi.fn(async () => ({
        ok: true,
        source: 'gateway',
        profiles: [
          { name: 'bob', title: 'Bob', color: '#e8483f', shape: 'galet' },
          { name: 'nova', title: 'Nova', color: '#e8483f', shape: 'cercle', served: false },
        ],
        primary: { title: 'Chief of Staff', color: '#8b5cf6', shape: 'cercle' },
      })),
    });
    await renderApp(bridge);
    await userEvent.click(await screen.findByText('Nova'));
    expect(await screen.findByText(/Connecting Nova/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry now' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove this bot' })).toBeTruthy();
    expect(bridge.sendChat).not.toHaveBeenCalled();
  });

  it('marks the bot as failed when the gateway cannot serve it', async () => {
    let ready: ((event: { name: string; served: boolean }) => void) | undefined;
    const bridge = makeBridge({
      profiles: vi.fn(async () => ({
        ok: true,
        source: 'gateway',
        profiles: [
          { name: 'bob', title: 'Bob', color: '#e8483f', shape: 'galet' },
          { name: 'nova', title: 'Nova', color: '#e8483f', shape: 'cercle', served: false },
        ],
        primary: { title: 'Chief of Staff', color: '#8b5cf6', shape: 'cercle' },
      })),
      onBotReady: vi.fn((callback) => {
        ready = callback;
        return () => undefined;
      }),
    });
    await renderApp(bridge);
    await userEvent.click(await screen.findByText('Nova'));
    await act(async () => {
      ready?.({ name: 'nova', served: false });
    });
    expect(await screen.findByText(/could not connect/)).toBeTruthy();
  });

  it('removes the bot when it is dismissed', async () => {
    const bridge = makeBridge({
      profiles: vi.fn(async () => ({
        ok: true,
        source: 'gateway',
        profiles: [
          { name: 'bob', title: 'Bob', color: '#e8483f', shape: 'galet' },
          { name: 'nova', title: 'Nova', color: '#e8483f', shape: 'cercle', served: false },
        ],
        primary: { title: 'Chief of Staff', color: '#8b5cf6', shape: 'cercle' },
      })),
    });
    await renderApp(bridge);
    await userEvent.click(await screen.findByText('Nova'));
    await userEvent.click(await screen.findByRole('button', { name: 'Remove this bot' }));
    await waitFor(() => expect(screen.queryByText(/Connecting Nova/)).toBeNull());
    expect(bridge.deleteBot).toHaveBeenCalledWith({ name: 'nova' });
  });
});

describe('the sessions of before', () => {
  async function openHistory(bridge: Record<string, unknown>) {
    await renderApp(bridge);
    await userEvent.click(
      screen.getByRole('button', { name: /Past conversations/ }),
    );
  }

  it('keeps the way into the history at the foot of the sidebar', async () => {
    await renderApp(makeBridge());
    const toggle = screen.getByRole('button', { name: /Past conversations/ });
    const nav = screen.getByRole('navigation', { name: 'Agents' });
    const settings = screen.getByRole('button', { name: 'Settings' });
    // Out of the scroll of the bots, and the last thing before the foot: a
    // long history never pushes the way in out of reach.
    expect(
      nav.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      toggle.compareDocumentPosition(settings) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('folds the history away until someone asks for it', async () => {
    await renderApp(makeBridge());
    const toggle = screen.getByRole('button', { name: /Past conversations/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Bridge audit')).toBeNull();
  });

  it('shows the past conversations under the bot that owns them', async () => {
    await openHistory(makeBridge());
    expect(
      screen.getByRole('button', { name: /Past conversations/ }).getAttribute(
        'aria-expanded',
      ),
    ).toBe('true');
    // The two bots of the bridge, and the primary one, each hold a group.
    expect(screen.getAllByText('Chief of Staff').length).toBeGreaterThan(1);
    expect(screen.getByText('Bob', { selector: '.history-group-name' })).toBeTruthy();
    expect(screen.getAllByText('Bridge audit').length).toBeGreaterThan(0);
  });

  it('reads a session the CLI never named as a sentence', async () => {
    await openHistory(makeBridge());
    expect(screen.getAllByText('Untitled conversation').length).toBe(1);
  });

  it('counts what the fold hides, and opens it', async () => {
    await openHistory(makeBridge());
    const more = screen.getByRole('button', { name: /See the 2 others/ });
    const before = screen.getAllByText(/^(Bridge audit|Tunnel refactor|Release checklist|Weekly notes)$/).length;
    await userEvent.click(more);
    expect(screen.queryByRole('button', { name: /See the/ })).toBeNull();
    expect(
      screen.getAllByText(/^(Bridge audit|Tunnel refactor|Release checklist|Weekly notes)$/).length,
    ).toBeGreaterThan(before);
  });

  it('searches the history with the search the sidebar already has', async () => {
    await openHistory(makeBridge());
    await userEvent.type(screen.getByLabelText('Search agents'), 'tunnel');
    expect(screen.getAllByText('Tunnel refactor').length).toBeGreaterThan(0);
    expect(screen.queryByText('Bridge audit')).toBeNull();
  });

  it('does not say no agents when only the history matched', async () => {
    await openHistory(makeBridge());
    await userEvent.type(screen.getByLabelText('Search agents'), 'tunnel');
    expect(screen.queryByText('No agents found')).toBeNull();
  });

  it('reads a past conversation over the bot that owns it', async () => {
    const bridge = makeBridge();
    await openHistory(bridge);
    const reads = bridge.messages.mock.calls.length;
    await userEvent.click(
      screen.getAllByRole('button', { name: /Bridge audit/ })[0],
    );
    expect(
      await screen.findByText(/This conversation started outside the app/),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /Back to Chief of Staff/ }),
    ).toBeTruthy();
    // The session is not read by the app yet: the room is a preview.
    expect(bridge.messages.mock.calls.length).toBe(reads);
    // One room is open at a time: the bot's row waits while the session is read.
    const botRow = screen
      .getByText('Chief of Staff', { selector: '.thread-name' })
      .closest('button');
    expect(botRow?.getAttribute('aria-current')).toBeNull();
  });

  it('goes back to the bot without losing it', async () => {
    await renderApp(makeBridge());
    await userEvent.click(
      screen.getByRole('button', { name: /Past conversations/ }),
    );
    await userEvent.click(
      screen.getAllByRole('button', { name: /Bridge audit/ })[0],
    );
    await userEvent.click(
      screen.getByRole('button', { name: /Back to Chief of Staff/ }),
    );
    expect(screen.queryByText(/started outside the app/)).toBeNull();
    expect(screen.getByLabelText(/Message/)).toBeTruthy();
  });

  it('says which session the composer writes into', async () => {
    await openHistory(makeBridge());
    await userEvent.click(
      screen.getAllByRole('button', { name: /Bridge audit/ })[0],
    );
    const chip = (await screen.findByText(/^since /)).closest(
      '.composer-context',
    );
    expect(chip?.textContent).toContain('Chief of Staff');
    expect(
      screen.getByRole('button', { name: 'Start a new one' }),
    ).toBeTruthy();
  });

  it('writes into the session without pretending the host answered', async () => {
    const bridge = makeBridge();
    await openHistory(bridge);
    await userEvent.click(
      screen.getAllByRole('button', { name: /Bridge audit/ })[0],
    );
    await userEvent.type(screen.getByLabelText(/Message/), 'Where were we?');
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByText('Where were we?')).toBeTruthy();
    expect(
      await screen.findByText(/This reply is simulated/),
    ).toBeTruthy();
    // Nothing reached Hermes: there is no turn on a session the app did not
    // open yet.
    expect(bridge.sendChat).not.toHaveBeenCalled();
  });

  it('leaves the session alone from the composer', async () => {
    await openHistory(makeBridge());
    await userEvent.click(
      screen.getAllByRole('button', { name: /Bridge audit/ })[0],
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Start a new one' }),
    );
    expect(screen.queryByText(/started outside the app/)).toBeNull();
    expect(screen.queryByText(/^since /)).toBeNull();
  });

  it('leaves the session with the escape key, unless a word is written', async () => {
    await openHistory(makeBridge());
    await userEvent.click(
      screen.getAllByRole('button', { name: /Bridge audit/ })[0],
    );
    await userEvent.type(screen.getByLabelText(/Message/), 'half a thought');
    await userEvent.keyboard('{Escape}');
    // A word already written is not thrown away by a key.
    expect(screen.getByText(/started outside the app/)).toBeTruthy();
    await userEvent.clear(screen.getByLabelText(/Message/));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByText(/started outside the app/)).toBeNull();
  });
});

describe('a warming bot past its delay', () => {
  it('drops an expired waiting bot on the next refresh', async () => {
    const { mergeBots, PENDING_BOT_TIMEOUT_MS } = await import('./App');
    const old = Date.now() - PENDING_BOT_TIMEOUT_MS - 1000;
    const current = [
      {
        id: 'agent-old',
        name: 'Old',
        profile: 'old',
        avatar: { color: '#fff', shape: 'cercle' as const, variant: 'neutral' as const },
        preview: 'Starting…',
        time: '…',
        chatTime: 'Now',
        messages: [],
        pending: true as const,
        pendingSince: old,
      },
    ];
    const next = mergeBots(
      current,
      [{ name: 'bob', title: 'Bob' }],
      new Map([['old', old]]),
      undefined,
      Date.now(),
    );
    expect(next.some((thread) => thread.profile === 'old')).toBe(false);
  });
});
