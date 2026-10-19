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

export type HermesBridge = {
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
