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
};

export type HermesProfileList = {
  ok: boolean;
  /** Bots, i.e. the profiles the gateway is serving. */
  profiles?: HermesProfile[];
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
  }) => Promise<HermesBotCreateResult>;
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
