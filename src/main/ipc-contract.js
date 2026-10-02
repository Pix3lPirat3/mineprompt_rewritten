'use strict';

const IPC_EVENT_CHANNELS = Object.freeze(['log', 'state', 'snapshot', 'inventory', 'attention']);

const IPC_REQUESTS = Object.freeze([
  ['getSnapshot', 'get-snapshot', 'snapshot'],
  ['execute', 'execute', 'execute'],
  ['connect', 'connect', 'connect'],
  ['disconnect', 'disconnect', 'disconnect'],
  ['complete', 'complete', 'complete'],
  ['selectSession', 'select-session', 'selectSession'],
  ['closeSession', 'close-session', 'closeSession'],
  ['reloadCommands', 'reload-commands', 'reloadCommands'],
  ['inventoryAction', 'inventory-action', 'inventoryAction'],
  ['getUiState', 'ui-state', 'uiState'],
  ['reportRendererIssue', 'report-renderer-issue', 'reportRendererIssue'],
  ['reportRendererState', 'report-renderer-state', 'reportRendererState'],
  ['playerAction', 'player-action', 'playerAction'],
  ['targetAction', 'target-action', 'targetAction'],
  ['storageAction', 'storage-action', 'storageAction'],
  ['blueprintAction', 'blueprint-action', 'blueprintAction'],
  ['capabilities', 'capabilities', 'capabilities'],
  ['capabilityAction', 'capability-action', 'capabilityAction'],
  ['recipes', 'recipes', 'recipes'],
  ['craft', 'craft', 'craft'],
  ['saveWorkflow', 'save-workflow', 'saveWorkflow'],
  ['removeWorkflow', 'remove-workflow', 'removeWorkflow'],
  ['runWorkflow', 'run-workflow', 'runWorkflow'],
  ['stopWorkflow', 'stop-workflow', 'stopWorkflow'],
  ['saveProfile', 'save-profile', 'saveProfile'],
  ['removeProfile', 'remove-profile', 'removeProfile'],
  ['saveServer', 'save-server', 'saveServer'],
  ['removeServer', 'remove-server', 'removeServer'],
  ['savePreferences', 'save-preferences', 'savePreferences'],
  ['saveMiningPreset', 'save-mining-preset', 'saveMiningPreset'],
  ['removeMiningPreset', 'remove-mining-preset', 'removeMiningPreset'],
  ['selectMiningPreset', 'select-mining-preset', 'selectMiningPreset'],
  ['engineList', 'engine-list', 'engineList'],
  ['engineResearch', 'engine-research', 'engineResearch'],
  ['enginePlan', 'engine-plan', 'enginePlan'],
  ['engineInstall', 'engine-install', 'engineInstall'],
  ['engineUse', 'engine-use', 'engineUse'],
  ['engineRemove', 'engine-remove', 'engineRemove']
].map(([api, channel, method]) => Object.freeze({ api, channel: `mineprompt:${channel}`, method })));

function createIpcRequests(invoke) {
  return Object.fromEntries(IPC_REQUESTS.map((request) => [request.api, (...args) => invoke(request.channel, ...args)]));
}

module.exports = { IPC_EVENT_CHANNELS, IPC_REQUESTS, createIpcRequests };
