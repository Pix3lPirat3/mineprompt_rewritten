'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const inventory = require('../commands/mineflayer/inventory/inventory');
const container = require('../commands/mineflayer/inventory/window');
const goto = require('../commands/mineflayer/navigation/goto');
const disconnect = require('../commands/mineflayer/disconnect');

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
  await container.execute(sender().value, 'container', ['take', '4', 'one'], { inventory: service });
  await container.execute(sender().value, 'container', ['deposit', 'all', 'confirm'], { inventory: service });
  assert.deepEqual(requests, [
    { scope: 'inventory', action: 'drop', target: 'diamond', quantity: 'all', confirmed: true },
    { scope: 'container', action: 'take', target: '4', quantity: 'one' },
    { scope: 'container', action: 'deposit', target: 'all', quantity: 'all', confirmed: true }
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
