'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const inventory = require('../commands/mineflayer/inventory/inventory');
const goto = require('../commands/mineflayer/navigation/goto');
const disconnect = require('../commands/mineflayer/disconnect');

function sender() {
  const replies = [];
  return { replies, value: { type: 'terminal', reply: (message) => replies.push(message) } };
}

test('lists and inspects inventory slots', () => {
  const item = { slot: 9, name: 'diamond', displayName: 'Diamond', count: 3 };
  const bot = {
    registry: { version: { '<': () => false } },
    inventory: {
      slots: Array.from({ length: 46 }, (_, index) => index === 9 ? item : null),
      items: () => [item]
    }
  };
  const ChatMessage = class {
    toString() { return 'Custom item'; }
  };
  const listing = sender();
  inventory.execute(listing.value, 'inventory', [], { bot, chatMessageClass: ChatMessage });
  assert.match(listing.replies[0], /diamond/u);
  assert.match(listing.replies[0], /3/u);
  const detail = sender();
  inventory.execute(detail.value, 'inventory', ['9'], { bot, chatMessageClass: ChatMessage });
  assert.match(detail.replies[0], /Name: diamond/u);
  assert.match(detail.replies[0], /Slot: 9/u);
  const invalid = sender();
  inventory.execute(invalid.value, 'inventory', ['99'], { bot, chatMessageClass: ChatMessage });
  assert.equal(invalid.replies[0], '[Inventory] Slot is out of range.');
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
