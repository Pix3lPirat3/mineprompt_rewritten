'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { setImmediate: nextTurn } = require('node:timers/promises');
const { Vec3 } = require('vec3');
const { ActivityManager } = require('../src/main/activity-manager');
const { StashService, collectedItems, inventoryCounts } = require('../src/main/stash-service');

async function completed(activities) {
  for (let attempt = 0; attempt < 50 && activities.has('stash'); attempt += 1) await nextTurn();
  assert.equal(activities.has('stash'), false);
}

function fixture({ containerPosition = new Vec3(8, 64, 0) } = {}) {
  const calls = [];
  const pickaxe = { slot: 36, type: 10, metadata: 0, name: 'iron_pickaxe', displayName: 'Iron Pickaxe', count: 1, nbt: null };
  const cobblestone = { slot: 9, type: 1, metadata: 0, name: 'cobblestone', displayName: 'Cobblestone', count: 7, nbt: null };
  const inventoryItems = [pickaxe];
  const start = new Vec3(0, 64, 0);
  const drop = { id: 2, name: 'item', isValid: true, position: new Vec3(2, 64, 0) };
  const chest = { name: 'chest', displayName: 'Chest', position: containerPosition };
  const bot = {
    entity: { position: start.clone(), yaw: 1.2, pitch: -0.3 },
    entities: { 2: drop },
    inventory: { items: () => inventoryItems },
    currentWindow: null,
    findBlocks: () => [containerPosition],
    blockAtCursor: () => ({ name: 'stone', position: new Vec3(1, 64, 0) }),
    blockAt: () => chest,
    pathfinder: {
      goto: async (goal) => {
        calls.push(['goto', goal.x, goal.y, goal.z]);
        bot.entity.position = new Vec3(goal.x, goal.y, goal.z);
      }
    },
    clearControlStates: () => {},
    waitForTicks: async () => {
      if (drop.isValid) {
        drop.isValid = false;
        inventoryItems.push(cobblestone);
      }
    },
    lookAt: async (position) => { calls.push(['lookAt', position]); },
    look: async (yaw, pitch, force) => { calls.push(['look', yaw, pitch, force]); },
    openContainer: async () => ({
      deposit: async (type, metadata, count) => { calls.push(['deposit', type, metadata, count]); },
      close: async () => { calls.push(['close']); }
    })
  };
  const activities = new ActivityManager();
  const logs = [];
  const mining = { suspendConsistent: () => { calls.push(['pause-mining']); return () => calls.push(['resume-mining']); } };
  const service = new StashService({ getClient: () => ({ bot }), activities, mining, logger: { log: (message) => logs.push(message), warn: (message) => logs.push(message) } });
  return { activities, bot, calls, logs, service };
}

test('deposits only nearby collected item gains and restores position and view', async () => {
  const value = fixture();
  const status = value.service.start({ mode: 'nearby', collectionRadius: 16, containerRadius: 16 });
  assert.deepEqual(status.containerPosition, { x: 8, y: 64, z: 0 });
  await completed(value.activities);
  assert.deepEqual(value.calls.filter((entry) => entry[0] === 'deposit'), [['deposit', 1, 0, 7]]);
  assert.equal(value.calls.some((entry) => entry[0] === 'deposit' && entry[1] === 10), false);
  assert.equal(value.calls.some((entry) => entry[0] === 'goto' && entry[1] === 0), true);
  const finalLook = value.calls.filter((entry) => entry[0] === 'lookAt').at(-1);
  assert.deepEqual([finalLook[1].x, finalLook[1].y, finalLook[1].z], [1.5, 64.5, 0.5]);
  assert.deepEqual(value.calls.filter((entry) => entry[0] === 'pause-mining' || entry[0] === 'resume-mining'), [['pause-mining'], ['resume-mining']]);
  assert.equal(value.service.status().phase, 'complete');
});

test('turns to a reachable container without walking to it', async () => {
  const value = fixture({ containerPosition: new Vec3(3, 64, 0) });
  value.service.start({ mode: 'nearby', collectionRadius: 16, containerRadius: 16 });
  await completed(value.activities);
  assert.equal(value.calls.some((entry) => entry[0] === 'goto' && entry[1] === 3), false);
  assert.equal(value.calls.some((entry) => entry[0] === 'lookAt'), true);
});

test('requires confirmation before depositing the full existing inventory', () => {
  const value = fixture();
  assert.throws(() => value.service.start({ mode: 'inventory', selector: 'all' }), /requires confirmation/u);
  assert.equal(value.activities.has('stash'), false);
});

test('tracks collected component variants independently', () => {
  const first = { type: 1, metadata: 0, count: 2, components: [{ type: 'custom_name', data: 'First' }] };
  const second = { type: 1, metadata: 0, count: 4, components: [{ type: 'custom_name', data: 'Second' }] };
  const before = inventoryCounts({ inventory: { items: () => [first] } });
  const after = inventoryCounts({ inventory: { items: () => [{ ...first, count: 3 }, second] } });
  assert.deepEqual(collectedItems(before, after).map((entry) => entry.count).sort((left, right) => left - right), [1, 4]);
});
