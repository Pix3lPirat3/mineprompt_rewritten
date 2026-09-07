'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const eventChannels = new Set(['log', 'state', 'snapshot', 'attention']);

contextBridge.exposeInMainWorld('mineprompt', Object.freeze({
  getSnapshot: () => ipcRenderer.invoke('mineprompt:get-snapshot'),
  execute: (input) => ipcRenderer.invoke('mineprompt:execute', input),
  complete: (input) => ipcRenderer.invoke('mineprompt:complete', input),
  reloadCommands: () => ipcRenderer.invoke('mineprompt:reload-commands'),
  saveProfile: (profile) => ipcRenderer.invoke('mineprompt:save-profile', profile),
  removeProfile: (username) => ipcRenderer.invoke('mineprompt:remove-profile', username),
  savePreferences: (preferences) => ipcRenderer.invoke('mineprompt:save-preferences', preferences),
  on: (channel, callback) => {
    if (!eventChannels.has(channel) || typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on(`mineprompt:${channel}`, listener);
    return () => ipcRenderer.removeListener(`mineprompt:${channel}`, listener);
  }
}));
