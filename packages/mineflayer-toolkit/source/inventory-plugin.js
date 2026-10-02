'use strict';

const { installRuntime } = require('./kernel');
const { installMining } = require('./mining-plugin');
const { registerCapability, serviceClient } = require('./shared');
const { InventoryService } = require('../../../src/main/inventory-service');
const { CraftingService } = require('../../../src/main/crafting-service');
const { StashService } = require('../../../src/main/stash-service');
const inventoryModel = require('../../../src/main/inventory-model');

function watchInventory(bot, client, onChange) {
  const listeners = [];
  const listen = (emitter, event, handler) => {
    if (!emitter?.on) return;
    emitter.on(event, handler);
    listeners.push(() => emitter.removeListener(event, handler));
  };
  const update = () => {
    client.inventoryEvents.revision += 1;
    onChange();
  };
  for (const event of ['windowOpen', 'windowClose', 'heldItemChanged', 'playerCollect']) listen(bot, event, update);
  listen(bot.inventory, 'updateSlot', update);
  return () => {
    for (const remove of listeners.splice(0).reverse()) remove();
  };
}

function installInventory(bot, options = {}) {
  const runtime = installRuntime(bot, options.runtime);
  if (runtime.has('inventory')) return runtime.get('inventory');
  const mining = options.mining || installMining(bot, options.miningOptions);
  const client = options.client || serviceClient(bot, options.clientState);
  let api;
  const notify = () => runtime.emit('inventory:change', api?.snapshot());
  const inventory = options.service || new InventoryService({ getClient: () => client, onChange: notify });
  const crafting = options.crafting || new CraftingService({ getClient: () => client, onChange: notify });
  const stash = options.stash || new StashService({
    getClient: () => client,
    activities: runtime.activities,
    mining: mining.service,
    logger: options.logger || runtime.logger,
    onChange: notify
  });
  const cleanup = options.client ? () => {} : watchInventory(bot, client, notify);
  api = Object.freeze({
    service: inventory,
    crafting,
    stash,
    execute: (request) => inventory.execute(request),
    inspect: (request) => inventory.inspect(request),
    recipes: (request) => crafting.list(request),
    craft: (request) => crafting.craft(request),
    startStash: (request) => stash.start(request),
    stopStash: () => stash.stop(),
    stashStatus: () => stash.status(),
    snapshot: () => ({
      connectionId: client.connectionAttempt,
      revision: client.inventoryEvents.revision,
      windowId: bot.currentWindow?.id ?? null,
      containerOpen: Boolean(bot.currentWindow),
      inventory: bot.inventory?.items?.().map((item) => inventoryModel.serializeItem(item, -1, -1, client.chatMessageClass, bot.registry)) || [],
      container: bot.currentWindow?.containerItems?.().map((item) => inventoryModel.serializeItem(item, -1, -1, client.chatMessageClass, bot.registry)) || []
    })
  });
  return registerCapability(runtime, 'inventory', api, 'Serialized inventory, container, crafting, and stash operations.', [
    {
      id: 'inventory.execute',
      title: 'Run an inventory action',
      capability: 'inventory',
      risk: 'dangerous',
      inputSchema: { type: 'object', additionalProperties: true },
      execute: ({ request }) => api.execute(request)
    },
    {
      id: 'inventory.inspect',
      title: 'Inspect an inventory item',
      capability: 'inventory',
      risk: 'read',
      inputSchema: { type: 'object', additionalProperties: true },
      execute: ({ request }) => api.inspect(request)
    }
  ], cleanup);
}

function inventoryPlugin(options = {}) {
  return (bot) => installInventory(bot, options);
}

module.exports = { installInventory, inventoryPlugin };
