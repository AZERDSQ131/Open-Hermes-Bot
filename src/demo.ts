// A host that answers, without a host.
//
// The window is one long conversation with Hermes: the sidebar is a list of
// profiles, a conversation is a session, and a turn is a stream. All of it is
// read from `window.hermes`, the bridge the preload installs. This file
// installs another one — same shape, made-up answers — so the interface can be
// looked at with the rooms full: bots, groups, and a history of sessions the
// window never opened.
//
// It is a tool, not a feature: nothing here ships in a build's first run, and
// it is only installed when `VITE_DEMO=1` was set on the dev server. The data
// is deterministic, so a screenshot and a second look agree.

import type { HermesBridge, HermesMessage, HermesSession } from './hermes';

type DemoBot = {
  name: string;
  title: string;
  color: string;
  shape: string;
};

type DemoSession = {
  id: string;
  title: string;
  /** The profile that holds it; empty is the primary one. */
  profile: string;
  messageCount: number;
  lastActive: number;
  archived: boolean;
  /** Written before this window: it belongs to the history, not the sidebar. */
  past: boolean;
};

const BOTS: DemoBot[] = [
  { name: 'atelier', title: 'Atelier', color: '#e8a33f', shape: 'galet' },
  { name: 'nova', title: 'Nova', color: '#5aa9e6', shape: 'cercle' },
  { name: 'bob', title: 'Bob', color: '#4f9d8f', shape: 'squircle' },
  { name: 'sentry', title: 'Sentry', color: '#d96d5f', shape: 'hexagone' },
  { name: 'scribe', title: 'Scribe', color: '#9b7bd4', shape: 'nuage' },
  { name: 'echo', title: 'Echo', color: '#c9b458', shape: 'goutte' },
  { name: 'patch', title: 'Patch', color: '#7fb069', shape: 'capsule' },
  { name: 'iris', title: 'Iris', color: '#e07a9b', shape: 'triangle' },
];

/** Three rooms, each held in the titles of its members' conversations. */
const GROUPS: Array<{ name: string; members: string[] }> = [
  { name: 'Le trio', members: ['nova', 'bob', 'atelier'] },
  { name: 'Atelier nuit', members: ['atelier', 'scribe'] },
  { name: 'Veille', members: ['sentry', 'echo'] },
];

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** The history of a bot: what the CLI wrote, and nobody opened here. */
const PAST: Array<{ profile: string; title: string; at: number; count: number }> =
  [
    { profile: '', title: 'Bridge audit', at: 2 * HOUR, count: 41 },
    { profile: '', title: '', at: 2 * DAY, count: 4 },
    { profile: '', title: 'Tunnel refactor', at: 6 * DAY, count: 12 },
    { profile: '', title: 'Release checklist', at: 21 * DAY, count: 7 },
    { profile: '', title: 'RSS: la nuit du 12', at: 64 * DAY, count: 33 },
    { profile: 'nova', title: 'Sprint planning', at: 5 * HOUR, count: 18 },
    { profile: 'nova', title: 'Notes de réunion', at: 9 * DAY, count: 6 },
    { profile: 'atelier', title: 'Refonte du dock', at: 26 * HOUR, count: 52 },
    { profile: 'atelier', title: 'Maquette sidebar', at: 3 * DAY, count: 9 },
    { profile: 'atelier', title: '', at: 40 * DAY, count: 2 },
    { profile: 'bob', title: 'Migration du Pi', at: 30 * HOUR, count: 27 },
    { profile: 'sentry', title: 'Alerte disque plein', at: 7 * HOUR, count: 15 },
    { profile: 'sentry', title: 'Incident du 3', at: 18 * DAY, count: 44 },
    { profile: 'scribe', title: 'Chapitre 4', at: 4 * DAY, count: 11 },
    { profile: 'echo', title: 'Revue du mercredi', at: 11 * DAY, count: 8 },
    { profile: 'patch', title: 'Trois bugs ouverts', at: 46 * HOUR, count: 21 },
    { profile: 'iris', title: 'Idées de noms', at: 12 * DAY, count: 5 },
  ];

function botOf(profile: string): DemoBot | undefined {
  return BOTS.find((bot) => bot.name === profile);
}

/**
 * The made-up host. Everything is kept in memory, so a rename lands in the
 * next read and a turn adds a line where it was written.
 */
function createDemoHost(now: number) {
  const sessions: DemoSession[] = [];

  // One conversation per bot, titled with the bot's name: that is the title
  // the window links a bot to.
  const seed = (sessionsOfBot: number) => {
    sessions.push({
      id: `sess:${sessionsOfBot}`,
      title: '',
      profile: '',
      messageCount: 0,
      lastActive: now - HOUR,
      archived: false,
      past: false,
    });
  };
  seed(0);
  sessions[0].title = 'Chief of Staff';
  sessions[0].messageCount = 13;
  BOTS.forEach((bot, index) => {
    sessions.push({
      id: `sess:${bot.name}`,
      title: bot.title,
      profile: bot.name,
      messageCount: 6 + index * 4,
      lastActive: now - (index + 1) * HOUR,
      archived: false,
      past: false,
    });
  });
  // The members of the groups hold their own conversations, and the group is
  // read back out of their titles.
  GROUPS.forEach((group, at) => {
    group.members.forEach((profile, index) => {
      sessions.push({
        id: `group:${group.name}:${profile}`,
        title: `Group · ${group.name} · ${botOf(profile)?.title ?? profile}`,
        profile,
        messageCount: 5 + index * 3 + at,
        lastActive: now - (at + 1) * 2 * HOUR,
        archived: false,
        past: false,
      });
    });
  });
  PAST.forEach((entry, index) => {
    sessions.push({
      id: `past:${index}`,
      title: entry.title,
      profile: entry.profile,
      messageCount: entry.count,
      lastActive: now - entry.at,
      archived: false,
      past: true,
    });
  });
  // Two runs of the demo schedules: an agent run is a conversation of its
  // own, so the Schedules page reads them back like any other session.
  sessions.push({
    id: 'cron_demo-morning_20261028_080000',
    title: 'The morning read · Oct 28 08:00',
    profile: '',
    messageCount: 3,
    lastActive: now - 26 * HOUR,
    archived: false,
    past: true,
  });
  sessions.push({
    id: 'cron_demo-morning_20261027_080000',
    title: 'The morning read · Oct 27 08:00',
    profile: '',
    messageCount: 4,
    lastActive: now - 50 * HOUR,
    archived: false,
    past: true,
  });
  sessions.push({
    id: 'cron_demo-notes_20261028_020000',
    title: 'Nightly notes · Oct 28 02:00',
    profile: '',
    messageCount: 3,
    lastActive: now - 32 * HOUR,
    archived: false,
    past: true,
  });

  sessions.push({
    id: 'cron_demo-inbox_20261028_170000',
    title: 'Inbox on Fridays · Oct 28 17:00',
    profile: '',
    messageCount: 2,
    lastActive: now - 18 * HOUR,
    archived: false,
    past: true,
  });

  // One archived row and one group row the section must not list.
  sessions.push({
    id: 'past:archived',
    title: 'Vieille affaire',
    profile: '',
    messageCount: 30,
    lastActive: now - 90 * DAY,
    archived: true,
    past: true,
  });
  sessions.push({
    id: 'past:group',
    title: 'Group · Le trio · Nova',
    profile: '',
    messageCount: 9,
    lastActive: now - 50 * DAY,
    archived: false,
    past: true,
  });

  const transcripts = new Map<string, HermesMessage[]>();
  // What a run wrote, so the page can be read back without a gateway: the
  // prompt the schedule carries, and what the bot answered.
  const runAt = now - 26 * HOUR;
  transcripts.set('cron_demo-morning_20261028_080000', [
    {
      role: 'user',
      content: 'Read the inbox, answer what can be answered, and leave the rest.',
      timestamp: runAt,
    },
    {
      role: 'assistant',
      content:
        'Four messages, two answered, one is a receipt and needs nothing, and one is from the accountant and asks for a date I do not have. I have left that one for you.',
      timestamp: runAt + 40 * 1000,
    },
    {
      role: 'assistant',
      content: 'Handed to Nova, whose chat carries it.',
      timestamp: runAt + 45 * 1000,
    },
  ]);
  const asSession = (session: DemoSession): HermesSession => ({
    id: session.id,
    title: session.title,
    messageCount: session.messageCount,
    lastActive: session.lastActive,
    archived: session.archived,
  });

  const transcriptOf = (id: string): HermesMessage[] => {
    const known = transcripts.get(id);
    if (known) return known;
    const session = sessions.find((entry) => entry.id === id);
    const title = session?.title?.trim() || 'Sans titre';
    const lines: HermesMessage[] = [
      {
        role: 'user',
        content: `On reprend « ${title} » ?`,
        timestamp: (session?.lastActive ?? now) - 3 * 60 * 1000,
      },
      {
        role: 'assistant',
        content: `Oui — ${session?.messageCount ?? 0} messages sont déjà là. J'ai relu le fil, rien n'a bougé.`,
        timestamp: (session?.lastActive ?? now) - 2 * 60 * 1000,
      },
      {
        role: 'user',
        content: 'Parfait. On continue là où on s’était arrêtés.',
        timestamp: (session?.lastActive ?? now) - 60 * 1000,
      },
      {
        role: 'assistant',
        content:
          'Compris. La pièce est la même, la mémoire aussi : je reprends le fil sans rien réexpliquer.',
        timestamp: session?.lastActive ?? now,
      },
    ];
    transcripts.set(id, lines);
    return lines;
  };

  const sendChat = async (payload: {
    sessionId?: string;
    message?: string;
  }) => {
    const id = String(payload?.sessionId ?? '');
    const lines = transcriptOf(id);
    lines.push({
      role: 'user',
      content: String(payload?.message ?? ''),
      timestamp: Date.now(),
    });
    const answer = `Reçu. (Réponse simulée — rien n'a quitté cette fenêtre.)`;
    lines.push({ role: 'assistant', content: answer, timestamp: Date.now() });
    const session = sessions.find((entry) => entry.id === id);
    if (session) session.messageCount = lines.length;
    return { ok: true, text: answer };
  };

  return { sessions, transcripts, asSession, transcriptOf, sendChat };
}

/** The bridge the app talks to when there is no host behind it. */
export function createDemoBridge(now: number = Date.now()): HermesBridge {
  const host = createDemoHost(now);
  const listeners = new Set<(delta: { requestId: string; text: string }) => void>();

  const own = (profile: string) =>
    host.sessions
      .filter((session) => !session.past && !session.archived && session.profile === profile)
      .map(host.asSession);

  const bridge = {
    demo: true,
    getSettings: async () => ({
      mode: 'ssh' as const,
      configured: true,
      sshHost: 'demo-host',
      apiPort: 8642,
      localPort: 18742,
      autoConnect: true,
      hasKey: true,
      keyElsewhere: '',
      onboardingCompleted: true,
    }),
    saveSettings: async () => ({
      ok: true,
      settings: await bridge.getSettings(),
    }),
    status: async () => ({
      state: 'connected' as const,
      version: '1.1.0-demo',
      label: 'demo-host',
      mode: 'ssh' as const,
      sshHost: 'demo-host',
    }),
    onStatus: () => () => undefined,
    profiles: async () => ({
      ok: true,
      source: 'gateway' as const,
      profiles: BOTS.map((bot) => ({
        name: bot.name,
        title: bot.title,
        color: bot.color,
        shape: bot.shape,
        served: true,
      })),
      primary: { title: 'Chief of Staff', color: '#8b5cf6', shape: 'cercle' },
    }),
    sessions: async (payload?: { profile?: string }) => ({
      ok: true,
      sessions: own(String(payload?.profile ?? '')),
    }),
    history: async (payload?: { profile?: string }) => ({
      ok: true,
      sessions: host.sessions
        .filter(
          (session) =>
            session.past &&
            session.profile === String(payload?.profile ?? ''),
        )
        .map(host.asSession),
    }),
    messages: async (payload?: { sessionId?: string }) => ({
      ok: true,
      messages: host.transcriptOf(String(payload?.sessionId ?? '')),
    }),
    createSession: async (payload?: { title?: string; profile?: string }) => {
      const id = `new:${host.sessions.length}`;
      host.sessions.push({
        id,
        title: String(payload?.title ?? 'Nouvelle conversation'),
        profile: String(payload?.profile ?? ''),
        messageCount: 0,
        lastActive: Date.now(),
        archived: false,
        past: false,
      });
      return { ok: true, sessionId: id };
    },
    renameSession: async (payload?: { sessionId?: string; title?: string }) => {
      const session = host.sessions.find(
        (entry) => entry.id === String(payload?.sessionId ?? ''),
      );
      if (session) session.title = String(payload?.title ?? session.title);
      return { ok: true, title: session?.title };
    },
    deleteSession: async (payload?: { sessionId?: string }) => {
      const at = host.sessions.findIndex(
        (entry) => entry.id === String(payload?.sessionId ?? ''),
      );
      if (at >= 0) host.sessions.splice(at, 1);
      return { ok: true };
    },
    sendChat: async (payload: {
      sessionId?: string;
      message?: string;
      requestId?: string;
    }) => {
      const result = await host.sendChat(payload);
      // The deltas arrive after the turn, the way a host paints them — and the
      // room already has the whole line when the window commits it.
      const requestId = String(payload?.requestId ?? '');
      for (const listener of listeners) listener({ requestId, text: result.text });
      return result;
    },
    cancelChat: async () => ({ ok: true }),
    onChatDelta: (listener: (delta: { requestId: string; text: string }) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onChatTool: () => () => undefined,
    onBotReady: () => () => undefined,
    models: async () => ({
      ok: true,
      current: 'muse-spark-1.3',
      currentProvider: 'opencode-go',
      models: [
        { model: 'muse-spark-1.3', provider: 'opencode-go', providerName: 'OpenCode', current: true },
        { model: 'deepseek-v4-pro', provider: 'opencode-go', providerName: 'OpenCode' },
        { model: 'glm-5.1', provider: 'opencode-go', providerName: 'OpenCode' },
      ],
    }),
    prefs: async () => ({ ok: true, prefs: {} }),
    savePrefs: async () => ({ ok: true }),
    createBot: async (payload?: { title?: string }) => {
      const name = `bot-${BOTS.length + 1}`;
      BOTS.push({
        name,
        title: String(payload?.title ?? 'Nouveau'),
        color: '#7d7d8c',
        shape: 'cercle',
      });
      return { ok: true, name, title: payload?.title ?? 'Nouveau' };
    },
    updateBot: async () => ({ ok: true }),
    deleteBot: async () => ({ ok: true }),
    importKey: async () => ({ ok: true, keyLength: 64 }),
    sshHosts: async () => ({ ok: true, hosts: ['demo-host', 'raspi'] }),
    test: async () => ({ state: 'connected' as const, version: '1.1.0-demo' }),
    connect: async () => ({ state: 'connected' as const }),
    disconnect: async () => ({ state: 'disconnected' as const }),
    connectors: async () => ({ catalog: [], toolkit: [], accounts: [] }),
    skills: async () => ({ ok: true, skills: [] }),
    toolsets: async () => ({ ok: true, tools: [] }),
    // The schedules of the demo host: one coming, one paused, one that
    // failed last night. The page is worth seeing with all three.
    jobs: async () => {
      const soon = Date.now() + 2 * 3_600_000;
      const yesterday = Date.now() - 26 * 3_600_000;
      return {
        ok: true,
        status: 200,
        jobs: [
          {
            id: 'demo-morning',
            name: 'The morning read',
            schedule_display: 'every day at 08:00',
            state: 'scheduled',
            enabled: true,
            next_run_at: new Date(soon).toISOString(),
            last_run_at: new Date(yesterday).toISOString(),
            last_status: 'ok',
            // The run worked and the result reached nobody: the page keeps
            // that apart from a failed run, and the demo shows it.
            last_delivery_error: "nova's gateway did not answer",
            deliver: 'bot-chat:nova',
            repeat: { completed: 41 },
          },
          {
            id: 'demo-inbox',
            name: 'Inbox on Fridays',
            schedule_display: 'every friday at 17:00',
            state: 'paused',
            enabled: false,
            next_run_at: new Date(soon).toISOString(),
            last_run_at: new Date(yesterday).toISOString(),
            last_status: 'ok',
            deliver: 'local',
            repeat: { completed: 6 },
          },
          {
            id: 'demo-notes',
            name: 'Nightly notes',
            schedule_display: 'every night at 02:00',
            state: 'scheduled',
            enabled: true,
            next_run_at: new Date(soon).toISOString(),
            last_run_at: new Date(yesterday).toISOString(),
            last_status: 'error',
            last_error: 'the model answered 429',
            deliver: 'local',
            repeat: { completed: 3 },
          },
        ],
      };
    },
    pauseJob: async () => ({ ok: true }),
    resumeJob: async () => ({ ok: true }),
    createJob: async () => ({ ok: true, job: { id: 'demo-new' } }),
    runJob: async () => ({ ok: true, job: { id: 'demo-morning' } }),
    toggleSkill: async () => ({ ok: true }),
    toggleToolset: async () => ({ ok: true }),
    updateState: async () => ({ ok: true, state: 'idle' as const }),
    checkForUpdates: async () => ({ ok: true }),
    installUpdate: async () => ({ ok: true }),
    openRelease: async () => ({ ok: true }),
    openLink: async () => ({ ok: true }),
    uploadAttachment: async () => ({ ok: true, path: '/tmp/demo.txt' }),
    transcribeVoice: async () => ({ ok: true, transcript: 'parole simulée' }),
  } as unknown as HermesBridge;

  // A call nobody wrote an answer for is not a crash: the pages that are not
  // part of the demo get an empty success, and a subscription gets a no-op.
  return new Proxy(bridge, {
    get(target, property: string | symbol) {
      if (property in target) {
        return (target as unknown as Record<string | symbol, unknown>)[property];
      }
      if (typeof property === 'string' && property.startsWith('on')) {
        return () => () => undefined;
      }
      if (typeof property === 'string') {
        return async () => ({ ok: true });
      }
      return undefined;
    },
  });
}

/** Hand the window a host that is not there. */
export function installDemoBridge(): void {
  (window as unknown as { hermes: HermesBridge }).hermes = createDemoBridge();
}
