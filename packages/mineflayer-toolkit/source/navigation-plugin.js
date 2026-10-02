'use strict';

const { installRuntime } = require('./kernel');
const { registerCapability } = require('./shared');
const { cancelNavigation, navigateGoal } = require('../../../src/main/navigation-service');
const { computePath, selectPathAwareStep } = require('../../../src/main/path-cost-planner');

function installNavigation(bot, options = {}) {
  const runtime = installRuntime(bot, options.runtime);
  if (runtime.has('navigation')) return runtime.get('navigation');
  const api = Object.freeze({
    cancel: () => cancelNavigation(bot),
    goto: (goal, request = {}) => navigateGoal(bot, goal, request),
    computePath: (goal, timeout, searchRadius) => computePath(bot, goal, timeout, searchRadius),
    selectPathAwareStep: (targets, stands, reach, request = {}) => selectPathAwareStep(bot, targets, stands, reach, request),
    get pathfinder() { return bot.pathfinder || null; }
  });
  return registerCapability(runtime, 'navigation', api, 'Verified Mineflayer Pathfinder navigation.', [
    {
      id: 'navigation.stop',
      title: 'Stop navigation',
      capability: 'movement',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: () => ({ stopped: api.cancel() })
    }
  ]);
}

function navigationPlugin(options = {}) {
  return (bot) => installNavigation(bot, options);
}

module.exports = { installNavigation, navigationPlugin };
