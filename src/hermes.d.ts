export type HermesConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

import type { UpdateState } from './updates';

/**
 * Where Hermes runs: on the machine the app runs on, or on another one,
 * reached over SSH.
 */
export type HermesConnectionMode = 'local' | 'ssh';

export type HermesStatus = {
  state: HermesConnectionState;
  version?: string;
  platform?: string;
  gateway?: string;
  sshHost?: string;
  /** Where Hermes runs, as the app understands it. */
  mode?: HermesConnectionMode;
  /** What the person is told: "This Mac", or the name of their host. */
  label?: string;
  message?: string;
};

export type HermesSettings = {
  /** Where Hermes runs. */
  mode: HermesConnectionMode;
  /**
   * The person has said where Hermes is: the setup does not have to ask
   * again.
   */
  configured: boolean;
  /** The host, when Hermes runs somewhere else. */
  sshHost: string;
  /** The port Hermes answers on, wherever it runs. */
  apiPort: number;
  /** The port the tunnel forwards to, when Hermes runs somewhere else. */
  localPort: number;
  autoConnect: boolean;
  hasKey: boolean;
  /** Whether the person has already been through the setup. */
  onboardingCompleted: boolean;
};

export type HermesBotCreateResult = {
  ok: boolean;
  error?: string;
  name?: string;
  title?: string;
  /** Already on the server: the earlier attempt outlived the app. */
  exists?: boolean;
  /** The colour the profile's metadata holds for this bot, if any. */
  color?: string;
};

export type HermesSessionResult = {
  ok: boolean;
  sessionId?: string;
  error?: string;
};

/** A conversation as Hermes holds it: the transcript lives in that session. */
export type HermesSession = {
  id: string;
  title: string;
  messageCount: number;
  lastActive: number;
  archived: boolean;
};

export type HermesSessionList = {
  ok: boolean;
  sessions?: HermesSession[];
  error?: string;
};

/** One stored line of a conversation. */
export type HermesMessage = {
  role: string;
  content: string;
  timestamp: number;
};

export type HermesMessageList = {
  ok: boolean;
  messages?: HermesMessage[];
  error?: string;
};

export type HermesModel = {
  model: string;
  provider: string;
  providerName: string;
  /** This is the model the profile is configured with. */
  current: boolean;
};

export type HermesModelList = {
  ok: boolean;
  current?: string;
  currentProvider?: string;
  models?: HermesModel[];
  error?: string;
};

export type HermesProfile = {
  /** Profile name, i.e. what the API calls it. */
  name: string;
  /** Title shown in Hermes, when the profile carries one. */
  title?: string;
  /** Colour Hermes paints this bot with, when the profile carries one. */
  color?: string;
  /** The face this bot wears, when the profile carries one. */
  shape?: string;
};

export type HermesProfileList = {
  ok: boolean;
  /** Bots, i.e. the profiles the gateway is serving. */
  profiles?: HermesProfile[];
  /** The primary profile: the bot the app always has. */
  primary?: HermesProfile;
  /** `gateway` is the live answer; `disk` is the offline fallback. */
  source?: 'gateway' | 'disk';
  /** Why the list came from disk instead of the gateway. */
  warning?: string;
  error?: string;
};

/** A skill the host holds: what a bot can be taught to do. */
export type HermesSkill = {
  name: string;
  description?: string;
  /** Whether the skill is on. */
  enabled?: boolean;
  /** Where the skill came from: the hub, the bundle, or the person. */
  provenance?: string;
  /** How many times the skill was used. */
  usage?: number;
};

/** A tool the host offers: what a bot can use besides Hermes itself. */
export type HermesToolset = {
  name: string;
  label?: string;
  description?: string;
  /** Whether the tool is on. */
  enabled?: boolean;
  /** Whether the keys it needs are there. */
  configured?: boolean;
  /** The tools it carries. */
  tools?: string[];
};

/** One row of the catalogue of connectors. */
export type HermesConnectorCatalog = {
  slug: string;
  name?: string;
  description?: string;
  category?: string;
  logo?: string;
};

/** One connector of the toolkit of the account. */
export type HermesConnectorToolkit = {
  connector: string;
  enabled?: boolean;
  connected?: boolean;
  status?: string;
};

/** One account: a service that is connected. */
export type HermesConnectorAccount = {
  connector: string;
  status?: string;
  label?: string;
  active?: boolean;
};

/** The connectors of the host, as the host answered with them. */
export type HermesConnectorList = {
  ok: boolean;
  /** Whether the connectors are there at all on this host. */
  available: boolean;
  catalog: HermesConnectorCatalog[];
  toolkit: HermesConnectorToolkit[];
  accounts: HermesConnectorAccount[];
  message?: string;
  error?: string;
};

export type HermesChatResult = {
  ok: boolean;
  text?: string;
  error?: string;
  /** The renderer abandoned this turn for a newer message. */
  canceled?: boolean;
};

export type HermesChatDelta = { requestId: string; text: string };
export type HermesChatTool = { requestId: string; tool: string };

/** What the app knows about its own next version. */
export type HermesUpdateInfo = {
  /** The version the app is running. */
  version: string;
  /** Whether the app has a way of finding the next one. */
  supported: boolean;
};

/** What the shell says happened while looking for an update. */
export type HermesUpdateEvent = {
  state: UpdateState;
  version?: string;
  /** When the version that was found was published, the way Github wrote it. */
  released?: string;
  percent?: number;
  message?: string;
  /**
   * The look was the app's own: the new version waits for the app to close
   * instead of taking it over.
   */
  quiet?: boolean;
};

/** How a check ended: ready, current, unsupported, or an error. */
export type HermesUpdateResult = {
  ok: boolean;
  state: UpdateState;
  version?: string;
  message?: string;
};

/** What GitHub put on the page of the project, before the words trim it. */
export type HermesUpdateHistory = {
  ok: boolean;
  rows?: unknown[];
  /** Where the page of the releases lives, the way the shell found it. */
  page?: string;
  message?: string;
};

export type HermesBridge = {
  createSession: (payload: {
    profile?: string;
    title?: string;
  }) => Promise<HermesSessionResult>;
  /** The conversations Hermes holds for a profile. */
  sessions: (payload: { profile?: string }) => Promise<HermesSessionList>;
  /** The transcript of one conversation, oldest first. */
  messages: (payload: {
    profile?: string;
    sessionId: string;
    limit?: number;
  }) => Promise<HermesMessageList>;
  /** Renames a conversation so it stays findable by its title. */
  renameSession: (payload: {
    profile?: string;
    sessionId: string;
    title: string;
  }) => Promise<{ ok: boolean; title?: string; error?: string }>;
  /** Deletes a conversation and the transcript it holds. */
  deleteSession: (payload: {
    profile?: string;
    sessionId: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  /** Deletes a bot: the Hermes profile that is the bot. */
  deleteBot: (payload: {
    name: string;
  }) => Promise<{ ok: boolean; name?: string; error?: string }>;
  /** Copies an attached file to the server, where the bot can read it. */
  uploadAttachment: (payload: {
    name: string;
    /** The file, base64 encoded. */
    data: string;
  }) => Promise<{
    ok: boolean;
    name?: string;
    path?: string;
    bytes?: number;
    error?: string;
  }>;
  /** Hands a recording to Hermes, which transcribes it. */
  transcribeVoice: (payload: {
    /** The recording, base64 encoded. */
    data: string;
    mimeType?: string;
  }) => Promise<{ ok: boolean; transcript?: string; error?: string }>;
  /** The app's preferences, kept on the server with the primary profile. */
  prefs: () => Promise<{ ok: boolean; prefs?: Record<string, unknown>; error?: string }>;
  savePrefs: (payload: {
    prefs: Record<string, unknown>;
  }) => Promise<{ ok: boolean; error?: string }>;
  models: (payload: { profile?: string }) => Promise<HermesModelList>;
  profiles: () => Promise<HermesProfileList>;
  /** The skills the host holds. */
  skills: (payload?: { profile?: string }) => Promise<{
    ok: boolean;
    skills: HermesSkill[];
    error?: string;
  }>;
  /** A skill is turned on or off, on the host. */
  toggleSkill: (payload: {
    name: string;
    enabled: boolean;
    profile?: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  /** The tools the host offers. */
  toolsets: (payload?: { profile?: string }) => Promise<{
    ok: boolean;
    toolsets: HermesToolset[];
    error?: string;
  }>;
  /** A tool is turned on or off, on the host. */
  toggleToolset: (payload: {
    name: string;
    enabled: boolean;
    profile?: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  /** The connectors of the host: the services a bot can reach. */
  connectors: () => Promise<HermesConnectorList>;
  /** The host starts a connection and answers with the link to open. */
  connectConnector: (payload: { slug: string }) => Promise<{
    ok: boolean;
    url?: string;
    error?: string;
  }>;
  /** Opens a link in the browser. */
  openLink: (url: string) => Promise<{ ok: boolean }>;
  sendChat: (payload: {
    requestId: string;
    sessionId: string;
    message: string;
    profile?: string;
    model?: string;
    provider?: string;
    /** Appended to the system prompt for this turn only. */
    instructions?: string;
  }) => Promise<HermesChatResult>;
  /** Stop a turn in flight; used when a newer message replaces it. */
  cancelChat: (requestId: string) => Promise<{ ok: boolean }>;
  onChatDelta: (callback: (delta: HermesChatDelta) => void) => () => void;
  onChatTool: (callback: (tool: HermesChatTool) => void) => () => void;
  getSettings: () => Promise<HermesSettings>;
  saveSettings: (payload: {
    /** Where Hermes runs. */
    mode?: HermesConnectionMode;
    /** The host, when Hermes runs somewhere else. */
    sshHost?: string;
    apiPort: number;
    localPort?: number;
    autoConnect?: boolean;
    apiKey?: string;
    clearKey?: boolean;
  }) => Promise<{ ok: boolean; error?: string; settings?: HermesSettings }>;
  importKey: (payload: {
    /** Where Hermes runs. */
    mode?: HermesConnectionMode;
    sshHost?: string;
  }) => Promise<{ ok: boolean; error?: string; keyLength?: number }>;
  /**
   * The hosts the person's `~/.ssh/config` already names, the way the setup
   * calls them — a machine the person does not have to name twice.
   */
  sshHosts: () => Promise<{
    ok: boolean;
    hosts: string[];
    error?: string;
  }>;
  /** Remembers that the person has been through the setup. */
  setOnboarding: (payload: {
    completed: boolean;
  }) => Promise<{ ok: boolean; settings?: HermesSettings }>;
  test: (payload: {
    /** Where Hermes runs. */
    mode?: HermesConnectionMode;
    /** The host, when Hermes runs somewhere else. */
    sshHost?: string;
    apiPort: number;
    apiKey?: string;
  }) => Promise<HermesStatus>;
  createBot: (payload: {
    name: string;
    title?: string;
    description?: string;
    color?: string;
    shape?: string;
  }) => Promise<HermesBotCreateResult>;
  /** Writes the identity of a bot — name, colour, face — on the server. */
  updateBot: (payload: {
    name: string;
    title?: string;
    color?: string;
    shape?: string;
  }) => Promise<{
    ok: boolean;
    name?: string;
    title?: string;
    color?: string;
    shape?: string;
    error?: string;
  }>;
  connect: () => Promise<HermesStatus>;
  disconnect: () => Promise<HermesStatus>;
  status: () => Promise<HermesStatus>;
  onStatus: (callback: (status: HermesStatus) => void) => () => void;
  /** The version the app is running, and whether it can find the next one. */
  updateInfo: () => Promise<HermesUpdateInfo>;
  /** Looks for an update, and downloads it if there is one. */
  checkForUpdates: () => Promise<HermesUpdateResult>;
  /** Where the look stands right now, for the mark that opens on it. */
  updateState: () => Promise<HermesUpdateEvent>;
  /** Lets the new version take over: the app comes back as itself. */
  installUpdate: () => Promise<{ ok: boolean }>;
  /** What GitHub has put on the page of the project, row by row. */
  updateHistory: () => Promise<HermesUpdateHistory>;
  /** A row of the history opens where its release lives. */
  openRelease: (url: string) => Promise<{ ok: boolean }>;
  /** Says what happened while looking for an update. */
  onUpdate: (callback: (event: HermesUpdateEvent) => void) => () => void;
};

declare global {
  interface Window {
    hermes?: HermesBridge;
  }
}
