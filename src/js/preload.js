'use strict';

const { contextBridge, ipcRenderer } = require('electron');
const { IPC_EVENT_CHANNELS, createIpcRequests } = require('../main/ipc-contract');

const eventChannels = new Set(IPC_EVENT_CHANNELS);

contextBridge.exposeInMainWorld('mineprompt', Object.freeze({
  ...createIpcRequests((channel, ...args) => ipcRenderer.invoke(channel, ...args)),
  checkForUpdate: () => ipcRenderer.invoke('mineprompt:check-for-update'),
  openReleases: () => ipcRenderer.invoke('mineprompt:open-releases'),
  exportDiagnostics: () => ipcRenderer.invoke('mineprompt:export-diagnostics'),
  on: (channel, callback) => {
    if (!eventChannels.has(channel) || typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on(`mineprompt:${channel}`, listener);
    return () => ipcRenderer.removeListener(`mineprompt:${channel}`, listener);
  }
}));
