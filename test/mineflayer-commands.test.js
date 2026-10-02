'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const inventory = require('../commands/mineflayer/inventory/inventory');
const animation = require('../commands/mineflayer/animation');
const container = require('../commands/mineflayer/inventory/window');
const goto = require('../commands/mineflayer/navigation/goto');
const disconnect = require('../commands/mineflayer/disconnect');
const openWindow = require('../commands/mineflayer/inventory/openwindow');
const playerCommand = require('../commands/mineflayer/player');
const entities = require('../commands/mineflayer/entities');
const target = require('../commands/mineflayer/target');
const consistentMine = require('../commands/mineflayer/world/consistentmine');
const mine = require('../commands/mineflayer/world/mine');
const stashCommand = require('../commands/mineflayer/world/stash');
const storageCommand = require('../commands/mineflayer/world/storage');
const buildCommand = require('../commands/global/build');

function sender() {
  const replies = [];
  return { replies, value: { type: 'terminal', reply: (message) => replies.push(message) } };
}

test('lists and inspects inventory slots', async () => {
  const item = { slot: 9, name: 'diamond', displayName: 'Diamond', count: 3 };
  const service = {
    items: () => [item],
    execute: async (request) => {
      if (request.target !== '9') throw new Error('No item was found.');
      return { message: '[Inventory] Diamond\nName: diamond\nCount: 3\nSlot: 9' };
    }
  };
  const listing = sender();
  await inventory.execute(listing.value, 'inventory', [], { inventory: service });
  assert.match(listing.replies[0], /diamond/u);
  assert.match(listing.replies[0], /3/u);
  const detail = sender();
  await inventory.execute(detail.value, 'inventory', ['9'], { inventory: service });
  assert.match(detail.replies[0], /Name: diamond/u);
  assert.match(detail.replies[0], /Slot: 9/u);
});

test('maps terminal inventory actions to the shared service', async () => {
  const requests = [];
  const service = {
    items: () => [],
    execute: async (request) => {
      requests.push(request);
      return { message: 'Completed.' };
    }
  };
  await inventory.execute(sender().value, 'inventory', ['drop', 'diamond', 'all', 'confirm'], { inventory: service });
  await inventory.execute(sender().value, 'inventory', ['use', 'diamond_sword', 'offhand'], { inventory: service });
  await inventory.execute(sender().value, 'inventory', ['swing', 'diamond_sword', 'right'], { inventory: service });
  await animation.execute(sender().value, 'animation', ['left', 'diamond_sword'], { inventory: service });
  await container.execute(sender().value, 'container', ['take', '4', 'one'], { inventory: service });
  await container.execute(sender().value, 'container', ['deposit', 'all', 'confirm'], { inventory: service });
  await container.execute(sender().value, 'container', ['transfer', 'inventory', '36', 'half'], { inventory: service });
  assert.deepEqual(requests, [
    { scope: 'inventory', action: 'drop', target: 'diamond', quantity: 'all', confirmed: true },
    { scope: 'inventory', action: 'use', target: 'diamond_sword', hand: 'offhand' },
    { scope: 'inventory', action: 'swing', target: 'diamond_sword', arm: 'right' },
    { scope: 'inventory', action: 'swing', target: 'diamond_sword', arm: 'left' },
    { scope: 'container', action: 'take', target: '4', quantity: 'one' },
    { scope: 'container', action: 'deposit', target: 'all', quantity: 'all', confirmed: true },
    { scope: 'container', action: 'transfer', sourceScope: 'inventory', target: '36', quantity: 'half' }
  ]);
});

test('navigates to players and coordinates', async () => {
  const goals = [];
  const bot = {
    players: {
      Builder: { username: 'Builder', entity: { position: { x: 10, y: 64, z: -3 } } }
    },
    pathfinder: { goto: async (goal) => goals.push(goal) }
  };
  const playerTarget = sender();
  await goto.execute(playerTarget.value, 'goto', ['builder', '4'], { bot });
  assert.equal(playerTarget.replies[0], '[Goto] Navigating to Builder.');
  assert.deepEqual([goals[0].x, goals[0].y, goals[0].z, goals[0].rangeSq], [10, 64, -3, 16]);

  const coordinateTarget = sender();
  await goto.execute(coordinateTarget.value, 'goto', ['1', '70', '-8', '1'], { bot });
  assert.equal(coordinateTarget.replies[0], '[Goto] Navigating to 1, 70, -8.');
  assert.deepEqual([goals[1].x, goals[1].y, goals[1].z, goals[1].rangeSq], [1, 70, -8, 1]);

  const invalid = sender();
  await goto.execute(invalid.value, 'goto', ['x', '70', '-8'], { bot });
  assert.equal(invalid.replies[0], '[Goto] X must be a number.');
});

test('uses the client lifecycle for disconnects', async () => {
  let disconnected = false;
  const client = { disconnect: async () => { disconnected = true; } };
  const response = sender();
  await disconnect.execute(response.value, 'disconnect', [], { client });
  assert.equal(disconnected, true);
  assert.match(response.replies[0], /Disconnecting/u);
});

test('opens specialized block and villager windows', async () => {
  const opened = [];
  const furnace = { name: 'blast_furnace', displayName: 'Blast Furnace' };
  const villager = { name: 'villager', position: { distanceTo: () => 2 } };
  const bot = {
    blockAtCursor: () => furnace,
    entity: { position: { distanceTo: () => 2 } },
    nearestEntity: (predicate) => predicate(villager) ? villager : null,
    openFurnace: async (block) => opened.push(block),
    openVillager: async (entity) => opened.push(entity)
  };
  const blockResponse = sender();
  await openWindow.execute(blockResponse.value, 'openwindow', [], { bot });
  assert.equal(blockResponse.replies[0], '[OpenWindow] Opened Blast Furnace.');
  const villagerResponse = sender();
  await openWindow.execute(villagerResponse.value, 'openwindow', ['villager'], { bot });
  assert.equal(villagerResponse.replies[0], '[OpenWindow] Opened villager trading.');
  assert.deepEqual(opened, [furnace, villager]);
});

test('passes explicit friend overrides through the shared player dispatcher', async () => {
  const requests = [];
  const bot = { players: { Friend: { username: 'Friend', entity: {} } } };
  const response = sender();
  await playerCommand.execute(response.value, 'player', ['friend', 'attack', '--override-friend-protection'], {
    actions: { describe: () => [] },
    bot,
    dispatchPlayerAction: async (request, origin) => {
      requests.push({ request, origin });
      return { message: '[Combat] Attacked Friend.' };
    }
  });
  assert.equal(requests[0].request.overrideFriendProtection, true);
  assert.equal(requests[0].origin.type, 'terminal');
  assert.equal(response.replies[0], '[Combat] Attacked Friend.');
});

test('maps terminal cursor and entity commands to shared target actions', async () => {
  const requests = [];
  const miningPolicy = {
    tool: 'auto',
    lowDurability: 'switch',
    minimumDurability: 10,
    allowFluidAdjacent: false,
    allowFalling: false,
    include: [],
    exclude: [],
    reach: 4.8,
    maxBlocks: 4096
  };
  const targets = {
    snapshot: () => ({
      cursorBlock: { displayName: 'Stone', position: { x: 1, y: 64, z: 2 } },
      cursorEntity: null,
      entities: [{ id: 7, kind: 'item', displayName: 'Cobblestone', position: { x: 2, y: 64, z: 1 }, distance: 2 }]
    })
  };
  const dispatchTargetAction = async (request) => {
    requests.push(request);
    return { message: 'Target action completed.' };
  };
  await entities.execute(sender().value, 'entities', ['7', 'pickup'], { dispatchTargetAction, targets });
  await target.execute(sender().value, 'target', ['entity', 'activate'], { dispatchTargetAction, targets });
  await target.execute(sender().value, 'target', ['block', 'mine', '4'], { dispatchTargetAction, targets });
  await consistentMine.execute(sender().value, 'consistentmine', ['start', '10', '64', '-2', '1'], { activities: {}, dispatchTargetAction });
  assert.deepEqual(requests, [
    { actionId: 'entity.pickup', target: '7', overrideFriendProtection: false },
    { actionId: 'entity.activate', target: 'cursor', overrideFriendProtection: false },
    { actionId: 'block.mine-depth', target: 'cursor', depth: 4, policy: miningPolicy },
    {
      actionId: 'block.mine-exact',
      target: 'position',
      position: { x: 10, y: 64, z: -2 },
      depth: 1,
      policy: miningPolicy
    }
  ]);
});

test('maps cuboid mining flags to the shared mining service', async () => {
  const calls = [];
  const response = sender();
  const mining = {
    startRegion: (from, to, policy) => {
      calls.push({ from, to, policy });
      return { region: { size: 27 }, policy };
    }
  };
  await mine.execute(response.value, 'mine', ['region', '0', '60', '0', '2', '62', '2', '--tool', 'held', '--low', 'stop', '--min-durability', '20'], { activities: {}, bot: {}, mining });
  assert.deepEqual(calls[0].from, { x: 0, y: 60, z: 0 });
  assert.deepEqual(calls[0].to, { x: 2, y: 62, z: 2 });
  assert.equal(calls[0].policy.tool, 'held');
  assert.equal(calls[0].policy.minimumDurability, 20);
  assert.match(response.replies[0], /27 block region/u);
});

test('starts, reports, and stops nearby stash activities from the terminal', async () => {
  const calls = [];
  const stash = {
    start: (request) => {
      calls.push(['start', request]);
      return { phase: 'starting', containerPosition: { x: 4, y: 64, z: -2 }, deposited: 0 };
    },
    status: () => ({ phase: 'depositing', deposited: 12, failed: null }),
    stop: () => { calls.push(['stop']); return true; }
  };
  const started = sender();
  await stashCommand.execute(started.value, 'stash', ['nearby', '24', '12'], { stash });
  assert.deepEqual(calls[0], ['start', { mode: 'nearby', collectionRadius: 24, containerRadius: 12 }]);
  assert.match(started.replies[0], /4, 64, -2/u);
  const status = sender();
  await stashCommand.execute(status.value, 'stash', ['status'], { stash });
  assert.match(status.replies[0], /12 deposited/u);
  const stopped = sender();
  await stashCommand.execute(stopped.value, 'stash', ['stop'], { stash });
  assert.equal(calls.some((entry) => entry[0] === 'stop'), true);
  const unconfirmed = sender();
  await stashCommand.execute(unconfirmed.value, 'stash', ['inventory', 'all'], { stash });
  assert.match(unconfirmed.replies[0], /requires confirm/u);
});

test('registers, scans, and queries storage through one terminal service', async () => {
  const calls = [];
  const storage = {
    zones: () => [],
    saveZone: async (request) => { calls.push(['save', request]); return { id: 'main', name: request.name }; },
    start: (zone) => { calls.push(['scan', zone]); return { zoneName: 'Main', running: true }; },
    find: (item, options) => { calls.push(['find', item, options]); return [{ zoneName: 'Main', count: 64, displayName: 'Stone', variantId: 'variant', stale: false }]; }
  };
  const added = sender();
  await storageCommand.execute(added.value, 'storage', ['add', 'Main', '0', '64', '0', '8', '72', '8'], { bot: { entity: {} }, storage });
  assert.deepEqual(calls[0], ['save', { name: 'Main', from: { x: 0, y: 64, z: 0 }, to: { x: 8, y: 72, z: 8 } }]);
  const scanned = sender();
  await storageCommand.execute(scanned.value, 'storage', ['scan', 'main'], { bot: { entity: {} }, storage });
  assert.deepEqual(calls[1], ['scan', 'main']);
  const found = sender();
  await storageCommand.execute(found.value, 'storage', ['find', 'stone', 'main', '32'], { bot: { entity: {} }, storage });
  assert.deepEqual(calls[2], ['find', 'stone', { zone: 'main', minimum: '32' }]);
  assert.match(found.replies[0], /64 x Stone/u);
});

test('imports and previews blueprints through the shared build service', async () => {
  const calls = [];
  const blueprints = {
    importFile: async (file, options) => {
      calls.push(['import', file, options]);
      return { id: 'house', name: 'House', version: '1.21.11', dimensions: { x: 4, y: 5, z: 6 }, materialCount: 80 };
    },
    preview: async (reference, options) => {
      calls.push(['preview', reference, options]);
      return {
        blueprint: { name: 'House' },
        warnings: [],
        counts: { correct: 1, placeable: 2, replaceable: 3, conflicting: 4, temporarilyObstructed: 5, unknown: 6, unsupported: 7 },
        requirements: [],
        removals: []
      };
    }
  };
  const imported = sender();
  await buildCommand.execute(imported.value, 'build', ['import', 'house.schematic', '--version', '1.12.2', '--name', 'House'], { blueprints });
  assert.deepEqual(calls[0], ['import', 'house.schematic', { policy: {}, version: '1.12.2', name: 'House' }]);
  assert.match(imported.replies[0], /Imported House/u);
  const previewed = sender();
  await buildCommand.execute(previewed.value, 'build', ['preview', 'house', '--at', '10', '64', '-3', '--rotate', '90', '--mirror', 'x'], { bot: { entity: {} }, blueprints });
  assert.equal(calls[1][0], 'preview');
  assert.deepEqual(calls[1][2].anchor, { x: 10, y: 64, z: -3 });
  assert.equal(calls[1][2].rotation, 90);
  assert.equal(calls[1][2].mirror, 'x');
  assert.match(previewed.replies[0], /4 conflicts/u);
});
