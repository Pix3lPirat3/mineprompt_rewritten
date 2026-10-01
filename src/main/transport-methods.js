'use strict';

const SESSION_METHOD_NAMES = Object.freeze([
  'connect', 'execute', 'complete', 'disconnect', 'reloadCommands',
  'inventoryAction', 'inventoryInspect', 'debugEvaluate', 'playerAction', 'targetAction', 'miningAction', 'treeAction', 'stashAction',
  'recipes', 'craft', 'runWorkflow', 'stopWorkflow', 'close'
]);

const HOST_METHOD_NAMES = Object.freeze([
  'snapshot', 'execute', 'complete', 'connect', 'disconnect', 'selectSession', 'closeSession', 'reloadCommands', 'reload',
  'inventoryAction', 'inventoryInspect', 'debugEvaluate', 'playerAction', 'targetAction', 'miningAction', 'treeAction', 'stashAction',
  'recipes', 'craft', 'saveWorkflow', 'removeWorkflow', 'runWorkflow', 'stopWorkflow',
  'saveProfile', 'removeProfile', 'saveServer', 'removeServer', 'savePreferences', 'saveMiningPreset', 'removeMiningPreset',
  'selectMiningPreset', 'diagnostics', 'uiState', 'reportRendererIssue', 'reportRendererState', 'relationshipsList',
  'relationshipAdd', 'relationshipRemove', 'tools', 'callTool', 'openAiTools'
]);

function installRequestMethods(prototype, names) {
  for (const name of names) {
    if (Object.hasOwn(prototype, name)) continue;
    Object.defineProperty(prototype, name, {
      configurable: true,
      value: function requestMethod(...args) { return this.request(name, ...args); },
      writable: true
    });
  }
}

module.exports = { HOST_METHOD_NAMES, SESSION_METHOD_NAMES, installRequestMethods };
