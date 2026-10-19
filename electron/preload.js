const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hermes', {
  getSettings: () => ipcRenderer.invoke('hermes:settings:get'),
  saveSettings: (payload) => ipcRenderer.invoke('hermes:settings:save', payload),
  importKey: (payload) => ipcRenderer.invoke('hermes:key:import', payload),
  test: (payload) => ipcRenderer.invoke('hermes:test', payload),
  createBot: (payload) => ipcRenderer.invoke('hermes:bot:create', payload),
  createBotStatus: (payload) =>
    ipcRenderer.invoke('hermes:bot:status', payload),
  connect: () => ipcRenderer.invoke('hermes:connect'),
  disconnect: () => ipcRenderer.invoke('hermes:disconnect'),
  status: () => ipcRenderer.invoke('hermes:status'),
  onStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('hermes:status', listener);
    return () => ipcRenderer.removeListener('hermes:status', listener);
  },
});
