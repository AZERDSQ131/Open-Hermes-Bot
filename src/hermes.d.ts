export type HermesConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

export type HermesStatus = {
  state: HermesConnectionState;
  version?: string;
  platform?: string;
  gateway?: string;
  sshHost?: string;
  message?: string;
};

export type HermesSettings = {
  sshHost: string;
  apiPort: number;
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

export type HermesChatResult = {
  ok: boolean;
  text?: string;
  error?: string;
  /** The renderer abandoned this turn for a newer message. */
  canceled?: boolean;
};

export type HermesChatDelta = { requestId: string; text: string };
export type HermesChatTool = { requestId: string; tool: string };

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
    sshHost: string;
    apiPort: number;
    localPort?: number;
    autoConnect?: boolean;
    apiKey?: string;
    clearKey?: boolean;
  }) => Promise<{ ok: boolean; error?: string; settings?: HermesSettings }>;
  importKey: (payload: {
    sshHost: string;
  }) => Promise<{ ok: boolean; error?: string; keyLength?: number }>;
  /** Remembers that the person has been through the setup. */
  setOnboarding: (payload: {
    completed: boolean;
  }) => Promise<{ ok: boolean; settings?: HermesSettings }>;
  test: (payload: {
    sshHost: string;
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
};

declare global {
  interface Window {
    hermes?: HermesBridge;
  }
}
