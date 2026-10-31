export type HermesConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

import type { UpdateState } from './updates';
import type { KeyReadReason } from './setupHelp';

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
  /**
   * A failure the page can explain in its own words: `api-server-off` means
   * the host answered nothing on the API port, which is not the same thing
   * as Hermes being absent.
   */
  reason?: 'api-server-off';
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
  /**
   * The machine a saved key was read from, when that machine is not the one
   * the app is configured for. The key does not travel: the app says so
   * instead of offering a key that would be refused.
   */
  keyElsewhere?: string;
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
  /**
   * On the host, but Hermes has not answered for it yet: the bot exists, and
   * the setup shows it rather than dead-ending on it.
   */
  created?: boolean;
  /**
   * Whether the gateway serves this bot already. A profile is served at
   * Hermes' next rescan, so a bot that was just made is often not served yet:
   * the app warms it up in the background rather than making the person wait.
   */
  served?: boolean;
  /** The colour the profile's metadata holds for this bot, if any. */
  color?: string;
};

/** A bot that was made: the gateway serves it now, or still does not. */
export type HermesBotReady = {
  name: string;
  served: boolean;
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
  /**
   * False for a profile on disk the gateway does not serve yet (warming bot).
   * Absent or true means the gateway serves it.
   */
  served?: boolean;
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

/**
 * One schedule, as the host answers with it.
 *
 * The shape is Hermes' own: the fields are the ones the gateway's
 * `/api/jobs` serves, and the app only reads them. Anything missing is
 * missing because that host does not write it.
 */
export type HermesJob = {
  id?: string;
  name?: string;
  prompt?: string;
  /** The shape of the schedule: a cron expression, or an interval. */
  schedule?: {
    kind?: string;
    /** What a cron job carries, and what the host writes: `0 9 * * 1`. */
    expr?: string;
    /** The same thing under the name some versions use. */
    expression?: string;
    minutes?: number;
    display?: string;
  };
  /** The same thing in the host's words, already written. */
  schedule_display?: string;
  /** `scheduled`, `paused`, `completed`, `error`. */
  state?: string;
  enabled?: boolean;
  /** ISO 8601, with the host's offset. */
  next_run_at?: string;
  last_run_at?: string;
  last_status?: string;
  last_error?: string;
  /** The run worked and the result reached nobody: kept apart on purpose. */
  last_delivery_error?: string;
  deliver?: string;
  no_agent?: boolean;
  repeat?: { times?: number | null; completed?: number };
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
  /** A service the host connects by itself, outside the Nous portal. */
  mcp?: boolean;
};

/** One connector of the toolkit of the account. */
export type HermesConnectorToolkit = {
  connector: string;
  enabled?: boolean;
  connected?: boolean;
  status?: string;
  /** Whether the service is present on the host already. */
  installed?: boolean;
  /** A service the host connects by itself, outside the Nous portal. */
  mcp?: boolean;
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
  /** Whether the services are open on this host. */
  available: boolean;
  catalog: HermesConnectorCatalog[];
  toolkit: HermesConnectorToolkit[];
  accounts: HermesConnectorAccount[];
  /** Why a list could not be read, in the words of the host. */
  messages: string[];
  error?: string;
};

export type HermesChatResult = {
  ok: boolean;
  text?: string;
  error?: string;
  /** The renderer abandoned this turn for a newer message. */
  canceled?: boolean;
  /**
   * Why the turn stopped before the end, when it still produced an answer:
   * a spent step budget, a broken stream. The answer stands; the note says
   * what it is.
   */
  note?: string;
};

export type HermesChatDelta = { requestId: string; text: string };
export type HermesChatTool = { requestId: string; tool: string };
/** A command the host is holding, still in its wire shape. */
export type HermesChatApproval = {
  requestId: string;
  approval: Record<string, unknown>;
};
/** The host closed the request: answered, or timed out. */
export type HermesChatApprovalSettled = {
  requestId: string;
  approvalId: string;
};
/** The app stopped listening and watches the run instead. */
export type HermesChatWatch = { requestId: string; runId: string };

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
  /**
   * The sessions the host already held — the app did not open them. The same
   * shape as `sessions`, asked without the filter that keeps the app's own
   * conversations apart, and left for the window to sort out.
   */
  history: (payload: { profile?: string }) => Promise<HermesSessionList>;
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
  /**
   * The schedules of a bot: what it runs on its own, on the host.
   *
   * They live in the host's `cron/jobs.json`, and the gateway serves them on
   * the API the app already talks to. The app keeps none of it.
   */
  jobs: (payload?: { profile?: string }) => Promise<{
    ok: boolean;
    jobs: HermesJob[];
    error?: string;
    /** The HTTP status, when the host answered with one: 501 is a host
     * without the cron module, 0 is a host that did not answer at all. */
    status?: number;
  }>;
  /** A schedule is paused on the host, where the scheduler runs it. */
  pauseJob: (payload: {
    jobId: string;
    profile?: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  /** A paused schedule is resumed on the host. */
  resumeJob: (payload: {
    jobId: string;
    profile?: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  /**
   * A schedule is created on the host, where it will run.
   *
   * The body is the one the gateway takes: `name`, `schedule`, `prompt`,
   * `deliver`, and `repeat` when it is a series. A `400` carries the host's
   * own words for what is wrong with it, and those are shown as they are.
   */
  createJob: (payload: {
    name: string;
    schedule: string;
    prompt: string;
    deliver: string;
    repeat?: number;
    profile?: string;
  }) => Promise<{
    ok: boolean;
    job?: HermesJob;
    error?: string;
    status?: number;
  }>;
  /**
   * A schedule is asked to run now.
   *
   * The host does not run it in the request: it sets the next run to this
   * moment and returns, and the gateway's ticker fires it. That is why the
   * call is quick, and why the row says the run is asked for rather than
   * done.
   */
  runJob: (payload: {
    jobId: string;
    profile?: string;
  }) => Promise<{ ok: boolean; job?: HermesJob; error?: string }>;
  /** The connectors of the host: the services a bot can reach. */
  connectors: (payload?: { fresh?: boolean }) => Promise<HermesConnectorList>;
  /**
   * The mark of a connector. The shell asks the vendor's service for it and
   * hands the bytes: the window touches no network of its own.
   */
  connectorLogo: (payload: { url: string }) => Promise<{
    ok: boolean;
    /** The picture, as a data url the page may draw. */
    logo?: string;
  }>;
  /** The host starts a connection and answers with the link to open. */
  connectConnector: (payload: { slug: string }) => Promise<{
    ok: boolean;
    url?: string;
    error?: string;
  }>;
  /**
   * A local service the host connects by itself: installed there, then
   * signed in by the provider's own browser flow. No Nous account.
   */
  mcpConnect: (payload: { name: string; installed?: boolean }) => Promise<{
    ok: boolean;
    url?: string;
    port?: number;
    error?: string;
  }>;
  /** Where that connection stands: the page waits for the browser. */
  mcpConnectStatus: (payload: { name: string }) => Promise<{
    done: boolean;
    ok: boolean;
    error?: string;
  }>;
  /** The person gives up on the browser: the flow is stopped. */
  mcpConnectCancel: (payload: { name: string }) => Promise<{ ok: boolean }>;
  /** Mint a Nous device code so the person signs in without the terminal. */
  nousLoginStart: () => Promise<{
    ok: boolean;
    url?: string;
    user_code?: string;
    device_code?: string;
    expires_in?: number;
    interval?: number;
    error?: string;
  }>;
  /** One poll for the device code above: pending waits, approval signs in. */
  nousLoginPoll: (payload: { device_code: string }) => Promise<{
    ok: boolean;
    pending: boolean;
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
    /** The bot, or the group member, for the notification of a finished turn. */
    botName?: string;
    /** The conversation, so a clicked notification opens the right one. */
    threadId?: string;
    /** Appended to the system prompt for this turn only. */
    instructions?: string;
    /** How hard the model thinks this turn; absent means the host decides. */
    reasoning?: { enabled?: boolean; effort?: string };
  }) => Promise<HermesChatResult>;
  /** Stop a turn in flight; used when a newer message replaces it. */
  cancelChat: (requestId: string) => Promise<{ ok: boolean }>;
  /** Answer a command the host is holding: once, session, always, or deny. */
  respondApproval: (payload: {
    runId: string;
    approvalId?: string;
    executionGeneration?: number | null;
    choice: string;
    profile?: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  onChatDelta: (callback: (delta: HermesChatDelta) => void) => () => void;
  onChatTool: (callback: (tool: HermesChatTool) => void) => () => void;
  onChatApproval: (
    callback: (event: HermesChatApproval) => void,
  ) => () => void;
  onChatApprovalSettled: (
    callback: (event: HermesChatApprovalSettled) => void,
  ) => () => void;
  /** The stream went quiet but the host kept the run: the app watches it. */
  onChatWatch: (callback: (watch: HermesChatWatch) => void) => () => void;
  /** A notification was clicked: the conversation it was about. */
  onNotificationOpen: (
    callback: (event: { threadId: string }) => void,
  ) => () => void;
  /** A bot that was made is served by the gateway, or still is not. */
  onBotReady: (callback: (event: HermesBotReady) => void) => () => void;
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
  }) => Promise<{
    ok: boolean;
    error?: string;
    keyLength?: number;
    /** Why the read found no key, when it found none. */
    reason?: KeyReadReason;
    /** The raw words of the command, when there are any worth showing. */
    details?: string;
  }>;
  /**
   * Asks Hermes to make the key its API server needs, on the host it runs
   * from, and reads it back. Refuses when a key is already there.
   */
  openApiServer: (payload: {
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
