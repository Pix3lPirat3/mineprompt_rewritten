'use strict';

const { installRuntime } = require('./kernel');
const { installMining } = require('./mining-plugin');
const { installTrees } = require('./tree-plugin');
const { installInventory } = require('./inventory-plugin');
const { registerCapability, serviceClient } = require('./shared');
const { PlayerActionRegistry } = require('../../../src/main/player-actions');
const { RelationshipService } = require('../../../src/main/relationship-service');
const { TargetingService } = require('../../../src/main/targeting-service');

class MemorySettingsStore {
  constructor(relationships = []) {
    this.settings = { relationships: Array.isArray(relationships) ? relationships : [] };
  }

  snapshot() {
    return { settings: { ...this.settings, relationships: [...this.settings.relationships] } };
  }

  async setSetting(key, value) {
    this.settings[key] = value;
    return value;
  }
}

function installInteractions(bot, options = {}) {
  const runtime = installRuntime(bot, options.runtime);
  if (runtime.has('interactions')) return runtime.get('interactions');
  const mining = options.mining || installMining(bot, options.miningOptions);
  const trees = options.trees || installTrees(bot, { ...options.treeOptions, mining });
  const inventory = options.inventory || installInventory(bot, { ...options.inventoryOptions, mining });
  const client = options.client || serviceClient(bot);
  const relationships = options.relationships || new RelationshipService(options.store || new MemorySettingsStore(options.initialRelationships));
  const players = options.playerActions || new PlayerActionRegistry({ relationships, logger: options.logger || runtime.logger });
  let targets;
  const notify = () => runtime.emit('interactions:change', targets.snapshot());
  targets = options.targets || new TargetingService({
    getClient: () => client,
    activities: runtime.activities,
    playerActions: players,
    mining: mining.service,
    trees: trees.service,
    stash: inventory.stash,
    logger: options.logger || runtime.logger,
    onChange: notify
  });
  const api = Object.freeze({
    relationships,
    players,
    targets,
    describePlayer: (username) => players.describe(bot, username),
    executePlayer: (request, origin = { type: 'library' }) => players.execute(request, { bot, activities: runtime.activities, origin }),
    snapshotTargets: () => targets.snapshot(),
    executeTarget: (request, origin = { type: 'library' }) => targets.execute(request, origin)
  });
  return registerCapability(runtime, 'interactions', api, 'Policy-aware player, entity, block, villager, and relationship interactions.', [
    {
      id: 'interactions.player',
      title: 'Run a player action',
      capability: 'players',
      risk: 'dangerous',
      inputSchema: {
        type: 'object',
        properties: { actionId: { type: 'string', minLength: 1 }, request: { type: 'object', additionalProperties: true } },
        required: ['actionId', 'request'],
        additionalProperties: false
      },
      execute: ({ request, origin }) => api.executePlayer({ actionId: request.actionId, ...request.request }, origin)
    },
    {
      id: 'interactions.target',
      title: 'Run a contextual target action',
      capability: 'world',
      risk: 'dangerous',
      inputSchema: { type: 'object', additionalProperties: true },
      execute: ({ request, origin }) => api.executeTarget(request, origin)
    }
  ]);
}

function interactionsPlugin(options = {}) {
  return (bot) => installInteractions(bot, options);
}

module.exports = { MemorySettingsStore, installInteractions, interactionsPlugin };
