'use strict';

const { installRuntime } = require('./kernel');
const { installMining } = require('./mining-plugin');
const { POSITION_SCHEMA, registerCapability, serviceClient } = require('./shared');
const { TreeService } = require('../../../src/main/tree-service');
const treePlanner = require('../../../src/main/tree-planner');
const treePolicy = require('../../../src/main/tree-policy');
const treeLifecycle = require('../../../src/main/tree-lifecycle');
const treeNavigation = require('../../../src/main/tree-navigation');

function installTrees(bot, options = {}) {
  const runtime = installRuntime(bot, options.runtime);
  if (runtime.has('trees')) return runtime.get('trees');
  const mining = options.mining || installMining(bot, options.miningOptions);
  const client = options.client || serviceClient(bot);
  const service = options.service || new TreeService({
    getClient: () => client,
    activities: runtime.activities,
    mining: mining.service,
    logger: options.logger || runtime.logger,
    onChange: () => runtime.events.emit('trees:change', service.status())
  });
  const api = Object.freeze({
    service,
    inspect: (request = {}) => service.inspect(request),
    fell: (request = {}) => service.start({ ...request, mode: 'fell' }),
    farm: (request = {}) => service.start({ ...request, mode: 'farm' }),
    stop: () => service.stop(),
    status: () => service.status(),
    normalizePolicy: treePolicy.normalizeTreePolicy
  });
  const requestSchema = {
    type: 'object',
    properties: {
      target: { type: 'string', enum: ['cursor', 'nearest', 'position'] },
      position: POSITION_SCHEMA,
      policy: { type: 'object', additionalProperties: true }
    },
    additionalProperties: false
  };
  return registerCapability(runtime, 'trees', api, 'Topology-aware tree inspection, felling, and forest farming.', [
    { id: 'trees.inspect', title: 'Inspect a tree', capability: 'status', risk: 'read', inputSchema: requestSchema, execute: ({ request }) => api.inspect(request) },
    { id: 'trees.fell', title: 'Fell a tree', capability: 'world', risk: 'dangerous', inputSchema: requestSchema, execute: ({ request }) => api.fell(request) },
    {
      id: 'trees.farm',
      title: 'Farm nearby trees',
      capability: 'world',
      risk: 'dangerous',
      inputSchema: { type: 'object', properties: { policy: { type: 'object', additionalProperties: true } }, additionalProperties: false },
      execute: ({ request }) => api.farm(request)
    },
    {
      id: 'trees.stop',
      title: 'Stop tree farming',
      capability: 'world',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: () => ({ stopped: api.stop(), status: api.status() })
    }
  ]);
}

function treePlugin(options = {}) {
  return (bot) => installTrees(bot, options);
}

module.exports = { installTrees, treeLifecycle, treeNavigation, treePlanner, treePlugin, treePolicy };
