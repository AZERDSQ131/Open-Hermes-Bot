const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hermes', {
  getSettings: () => ipcRenderer.invoke('hermes:settings:get'),
  saveSettings: (payload) => ipcRenderer.invoke('hermes:settings:save', payload),
  importKey: (payload) => ipcRenderer.invoke('hermes:key:import', payload),
  sshHosts: () => ipcRenderer.invoke('hermes:ssh:hosts'),
  setOnboarding: (payload) =>
    ipcRenderer.invoke('hermes:onboarding:set', payload),
  test: (payload) => ipcRenderer.invoke('hermes:test', payload),
  createBot: (payload) => ipcRenderer.invoke('hermes:bot:create', payload),
  updateBot: (payload) => ipcRenderer.invoke('hermes:bot:update', payload),
  deleteBot: (payload) => ipcRenderer.invoke('hermes:bot:delete', payload),
  deleteSession: (payload) => ipcRenderer.invoke('hermes:session:delete', payload),
  uploadAttachment: (payload) =>
    ipcRenderer.invoke('hermes:attachment:upload', payload),
  transcribeVoice: (payload) =>
    ipcRenderer.invoke('hermes:voice:transcribe', payload),
  prefs: () => ipcRenderer.invoke('hermes:prefs'),
  savePrefs: (payload) => ipcRenderer.invoke('hermes:prefs:save', payload),
  createSession: (payload) => ipcRenderer.invoke('hermes:session', payload),
  sessions: (payload) => ipcRenderer.invoke('hermes:sessions', payload),
  messages: (payload) => ipcRenderer.invoke('hermes:messages', payload),
  renameSession: (payload) => ipcRenderer.invoke('hermes:session:rename', payload),
  models: (payload) => ipcRenderer.invoke('hermes:models', payload),
  profiles: () => ipcRenderer.invoke('hermes:profiles'),
  /** The skills the host holds. */
  skills: (payload) => ipcRenderer.invoke('hermes:skills', payload),
  /** A skill is turned on or off, on the host. */
  toggleSkill: (payload) => ipcRenderer.invoke('hermes:skills:toggle', payload),
  /** The tools the host offers. */
  toolsets: (payload) => ipcRenderer.invoke('hermes:toolsets', payload),
  /** A tool is turned on or off, on the host. */
  toggleToolset: (payload) => ipcRenderer.invoke('hermes:toolsets:toggle', payload),
  /** The connectors of the host: the services a bot can reach. */
  connectors: () => ipcRenderer.invoke('hermes:connectors'),
  /** The host starts a connection and answers with the link to open. */
  connectConnector: (payload) =>
    ipcRenderer.invoke('hermes:connectors:connect', payload),
  /** Opens a link in the browser. */
  openLink: (url) => ipcRenderer.invoke('hermes:open', url),
  sendChat: (payload) => ipcRenderer.invoke('hermes:chat:send', payload),
  cancelChat: (requestId) => ipcRenderer.invoke('hermes:chat:cancel', requestId),
  onChatDelta: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('hermes:chat:delta', listener);
    return () => ipcRenderer.removeListener('hermes:chat:delta', listener);
  },
  onChatTool: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('hermes:chat:tool', listener);
    return () => ipcRenderer.removeListener('hermes:chat:tool', listener);
  },
  /** A bot that was made: the gateway serves it now, or still does not. */
  onBotReady: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('hermes:bot:ready', listener);
    return () => ipcRenderer.removeListener('hermes:bot:ready', listener);
  },
  connect: () => ipcRenderer.invoke('hermes:connect'),
  disconnect: () => ipcRenderer.invoke('hermes:disconnect'),
  status: () => ipcRenderer.invoke('hermes:status'),
  updateInfo: () => ipcRenderer.invoke('hermes:update:info'),
  checkForUpdates: () => ipcRenderer.invoke('hermes:update:check'),
  /** Where the look stands right now, for the mark that opens on it. */
  updateState: () => ipcRenderer.invoke('hermes:update:state'),
  installUpdate: () => ipcRenderer.invoke('hermes:update:install'),
  /** What GitHub has put on the page of the project, row by row. */
  updateHistory: () => ipcRenderer.invoke('hermes:update:history'),
  /** A row of the history opens where its release lives. */
  openRelease: (url) => ipcRenderer.invoke('hermes:update:open-release', url),
  onUpdate: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('hermes:update:event', listener);
    return () => ipcRenderer.removeListener('hermes:update:event', listener);
  },
  onStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('hermes:status', listener);
    return () => ipcRenderer.removeListener('hermes:status', listener);
  },
});
