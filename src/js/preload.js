'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const eventChannels = new Set(['log', 'state', 'snapshot', 'attention']);

contextBridge.exposeInMainWorld('mineprompt', Object.freeze({
  getSnapshot: () => ipcRenderer.invoke('mineprompt:get-snapshot'),
  execute: (input) => ipcRenderer.invoke('mineprompt:execute', input),
  complete: (input) => ipcRenderer.invoke('mineprompt:complete', input),
  reloadCommands: () => ipcRenderer.invoke('mineprompt:reload-commands'),
  on: (channel, callback) => {
    if (!eventChannels.has(channel) || typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on(`mineprompt:${channel}`, listener);
    return () => ipcRenderer.removeListener(`mineprompt:${channel}`, listener);
  }
}));
