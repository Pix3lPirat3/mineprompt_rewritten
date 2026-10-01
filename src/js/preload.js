'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const eventChannels = new Set(['log', 'state', 'snapshot', 'inventory', 'attention']);

contextBridge.exposeInMainWorld('mineprompt', Object.freeze({
  getSnapshot: () => ipcRenderer.invoke('mineprompt:get-snapshot'),
  execute: (input, sessionId) => ipcRenderer.invoke('mineprompt:execute', input, sessionId),
  connect: (options) => ipcRenderer.invoke('mineprompt:connect', options),
  disconnect: (sessionId) => ipcRenderer.invoke('mineprompt:disconnect', sessionId),
  complete: (input, sessionId) => ipcRenderer.invoke('mineprompt:complete', input, sessionId),
  selectSession: (sessionId) => ipcRenderer.invoke('mineprompt:select-session', sessionId),
  closeSession: (sessionId) => ipcRenderer.invoke('mineprompt:close-session', sessionId),
  reloadCommands: () => ipcRenderer.invoke('mineprompt:reload-commands'),
  inventoryAction: (request) => ipcRenderer.invoke('mineprompt:inventory-action', request),
  getUiState: (request) => ipcRenderer.invoke('mineprompt:ui-state', request),
  reportRendererIssue: (issue) => ipcRenderer.invoke('mineprompt:report-renderer-issue', issue),
  reportRendererState: (state) => ipcRenderer.invoke('mineprompt:report-renderer-state', state),
  playerAction: (request) => ipcRenderer.invoke('mineprompt:player-action', request),
  targetAction: (request) => ipcRenderer.invoke('mineprompt:target-action', request),
  recipes: (request) => ipcRenderer.invoke('mineprompt:recipes', request),
  craft: (request) => ipcRenderer.invoke('mineprompt:craft', request),
  saveWorkflow: (workflow) => ipcRenderer.invoke('mineprompt:save-workflow', workflow),
  removeWorkflow: (id) => ipcRenderer.invoke('mineprompt:remove-workflow', id),
  runWorkflow: (request) => ipcRenderer.invoke('mineprompt:run-workflow', request),
  stopWorkflow: (request) => ipcRenderer.invoke('mineprompt:stop-workflow', request),
  saveProfile: (profile) => ipcRenderer.invoke('mineprompt:save-profile', profile),
  removeProfile: (username) => ipcRenderer.invoke('mineprompt:remove-profile', username),
  saveServer: (profile) => ipcRenderer.invoke('mineprompt:save-server', profile),
  removeServer: (name) => ipcRenderer.invoke('mineprompt:remove-server', name),
  savePreferences: (preferences) => ipcRenderer.invoke('mineprompt:save-preferences', preferences),
  saveMiningPreset: (preset) => ipcRenderer.invoke('mineprompt:save-mining-preset', preset),
  removeMiningPreset: (id) => ipcRenderer.invoke('mineprompt:remove-mining-preset', id),
  selectMiningPreset: (id) => ipcRenderer.invoke('mineprompt:select-mining-preset', id),
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
