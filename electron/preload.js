const { contextBridge, ipcRenderer } = require('electron');

// A window with a host that is not there: `VITE_DEMO=1 npm run dev`. The
// renderer installs its own bridge when the flag is set, and this one must not
// be in the way — the preload is the only place that can leave the name free.
if (process.env.VITE_DEMO !== '1') contextBridge.exposeInMainWorld('hermes', {
  getSettings: () => ipcRenderer.invoke('hermes:settings:get'),
  saveSettings: (payload) => ipcRenderer.invoke('hermes:settings:save', payload),
  importKey: (payload) => ipcRenderer.invoke('hermes:key:import', payload),
  openApiServer: (payload) => ipcRenderer.invoke('hermes:api:open', payload),
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
  history: (payload) => ipcRenderer.invoke('hermes:history', payload),
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
  connectors: (payload) => ipcRenderer.invoke('hermes:connectors', payload),
  /** The schedules of a bot: what it runs on its own, on the host. */
  jobs: (payload) => ipcRenderer.invoke('hermes:jobs', payload),
  /** A schedule is paused on the host. */
  pauseJob: (payload) => ipcRenderer.invoke('hermes:jobs:pause', payload),
  /** A paused schedule is resumed on the host. */
  resumeJob: (payload) => ipcRenderer.invoke('hermes:jobs:resume', payload),
  /** A schedule is created on the host. */
  createJob: (payload) => ipcRenderer.invoke('hermes:jobs:create', payload),
  /** A schedule is asked to run now, on the host's next tick. */
  runJob: (payload) => ipcRenderer.invoke('hermes:jobs:run', payload),
  /** The mark of a connector: the shell asks for it, and hands the bytes. */
  connectorLogo: (payload) =>
    ipcRenderer.invoke('hermes:connectors:logo', payload),
  /** The host starts a connection and answers with the link to open. */
  connectConnector: (payload) =>
    ipcRenderer.invoke('hermes:connectors:connect', payload),
  /** A local service: installed on the host, signed in with the provider itself. */
  mcpConnect: (payload) => ipcRenderer.invoke('hermes:mcp:connect', payload),
  /** Where that connection stands: the page waits for the browser. */
  mcpConnectStatus: (payload) =>
    ipcRenderer.invoke('hermes:mcp:connect-status', payload),
  /** The person gives up on the browser: the flow is stopped. */
  mcpConnectCancel: (payload) =>
    ipcRenderer.invoke('hermes:mcp:connect-cancel', payload),
  /** Mint a Nous device code so the person signs in without the terminal. */
  nousLoginStart: () => ipcRenderer.invoke('hermes:nous:login-start'),
  /** One poll for the device code above: pending waits, approval signs in. */
  nousLoginPoll: (payload) =>
    ipcRenderer.invoke('hermes:nous:login-poll', payload),
  /** Opens a link in the browser. */
  openLink: (url) => ipcRenderer.invoke('hermes:open', url),
  sendChat: (payload) => ipcRenderer.invoke('hermes:chat:send', payload),
  cancelChat: (requestId) => ipcRenderer.invoke('hermes:chat:cancel', requestId),
  /** The answer to a command a bot is holding. */
  respondApproval: (payload) =>
    ipcRenderer.invoke('hermes:chat:approve', payload),
  onChatApproval: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('hermes:chat:approval', listener);
    return () => ipcRenderer.removeListener('hermes:chat:approval', listener);
  },
  onChatApprovalSettled: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('hermes:chat:approval-settled', listener);
    return () =>
      ipcRenderer.removeListener('hermes:chat:approval-settled', listener);
  },
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
  /** A notification was clicked: the conversation it was about. */
  onNotificationOpen: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('hermes:notification:open', listener);
    return () => ipcRenderer.removeListener('hermes:notification:open', listener);
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
