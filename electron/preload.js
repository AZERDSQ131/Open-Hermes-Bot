const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hermes', {
  getSettings: () => ipcRenderer.invoke('hermes:settings:get'),
  saveSettings: (payload) => ipcRenderer.invoke('hermes:settings:save', payload),
  importKey: (payload) => ipcRenderer.invoke('hermes:key:import', payload),
  test: (payload) => ipcRenderer.invoke('hermes:test', payload),
  createBot: (payload) => ipcRenderer.invoke('hermes:bot:create', payload),
  updateBot: (payload) => ipcRenderer.invoke('hermes:bot:update', payload),
  deleteBot: (payload) => ipcRenderer.invoke('hermes:bot:delete', payload),
  deleteSession: (payload) => ipcRenderer.invoke('hermes:session:delete', payload),
  uploadAttachment: (payload) =>
    ipcRenderer.invoke('hermes:attachment:upload', payload),
  transcribeVoice: (payload) =>
    ipcRenderer.invoke('hermes:voice:transcribe', payload),
  createSession: (payload) => ipcRenderer.invoke('hermes:session', payload),
  sessions: (payload) => ipcRenderer.invoke('hermes:sessions', payload),
  messages: (payload) => ipcRenderer.invoke('hermes:messages', payload),
  renameSession: (payload) => ipcRenderer.invoke('hermes:session:rename', payload),
  models: (payload) => ipcRenderer.invoke('hermes:models', payload),
  profiles: () => ipcRenderer.invoke('hermes:profiles'),
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
  connect: () => ipcRenderer.invoke('hermes:connect'),
  disconnect: () => ipcRenderer.invoke('hermes:disconnect'),
  status: () => ipcRenderer.invoke('hermes:status'),
  onStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('hermes:status', listener);
    return () => ipcRenderer.removeListener('hermes:status', listener);
  },
});
