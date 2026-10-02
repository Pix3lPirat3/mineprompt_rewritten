'use strict';

const { installRuntime } = require('./kernel');
const { installNavigation } = require('./navigation-plugin');
const { POSITION_SCHEMA, position, registerCapability, serviceClient } = require('./shared');
const { MiningService } = require('../../../src/main/mining-service');
const miningPlanner = require('../../../src/main/mining-planner');
const miningPolicy = require('../../../src/main/mining-policy');

function installMining(bot, options = {}) {
  const runtime = installRuntime(bot, options.runtime);
  if (runtime.has('mining')) return runtime.get('mining');
  installNavigation(bot, options.navigation);
  const client = options.client || serviceClient(bot);
  const service = options.service || new MiningService({
    getClient: () => client,
    activities: runtime.activities,
    logger: options.logger || runtime.logger,
    onChange: () => runtime.emit('mining:change', service.status())
  });
  const api = Object.freeze({
    service,
    mine: (block, policy) => service.mineOnce(block, policy),
    mineAt: (value, policy) => {
      const block = bot.blockAt(position(value));
      if (!block) throw new Error('The requested mining block is not loaded.');
      return service.mineOnce(block, policy);
    },
    consistent: (block, depth, policy) => service.startConsistent(block, depth, policy),
    consistentAt: (value, depth, policy) => {
      const block = bot.blockAt(position(value));
      if (!block) throw new Error('The requested mining block is not loaded.');
      return service.startConsistent(block, depth, policy);
    },
    region: (from, to, policy) => service.startRegion(from, to, policy),
    stop: () => runtime.activities.stop('regionmine') || runtime.activities.stop('consistentmine'),
    status: () => service.status(),
    normalizePolicy: miningPolicy.normalizeMiningPolicy
  });
  return registerCapability(runtime, 'mining', api, 'Policy-aware single, consistent, and region mining.', [
    {
      id: 'mining.once',
      title: 'Mine one block',
      capability: 'world',
      risk: 'dangerous',
      inputSchema: {
        type: 'object',
        properties: { position: POSITION_SCHEMA, policy: { type: 'object', additionalProperties: true } },
        required: ['position'],
        additionalProperties: false
      },
      execute: ({ request }) => api.mineAt(request.position, request.policy)
    },
    {
      id: 'mining.region',
      title: 'Mine a region',
      capability: 'world',
      risk: 'dangerous',
      inputSchema: {
        type: 'object',
        properties: { from: POSITION_SCHEMA, to: POSITION_SCHEMA, policy: { type: 'object', additionalProperties: true } },
        required: ['from', 'to'],
        additionalProperties: false
      },
      execute: ({ request }) => api.region(request.from, request.to, request.policy)
    },
    {
      id: 'mining.stop',
      title: 'Stop mining',
      capability: 'world',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: () => ({ stopped: api.stop(), status: api.status() })
    }
  ]);
}

function miningPlugin(options = {}) {
  return (bot) => installMining(bot, options);
}

module.exports = { installMining, miningPlanner, miningPlugin, miningPolicy };
