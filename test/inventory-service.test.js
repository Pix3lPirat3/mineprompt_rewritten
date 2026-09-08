'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { InventoryService } = require('../src/main/inventory-service');

function windowFixture(id, inventoryStart, inventoryEnd, slots) {
  return {
    id,
    slots,
    inventoryStart,
    inventoryEnd,
    hotbarStart: inventoryEnd - 9,
    items: () => slots.slice(inventoryStart, inventoryEnd).filter(Boolean),
    containerItems: () => slots.slice(0, inventoryStart).filter(Boolean)
  };
}

function fixture() {
  const diamond = { slot: 36, name: 'diamond', displayName: 'Diamond', count: 3, type: 1, metadata: 0 };
  const inventorySlots = Array(46).fill(null);
  inventorySlots[36] = diamond;
  const inventory = windowFixture(-1, 9, 46, inventorySlots);
  const calls = [];
  const bot = {
    entity: {},
    inventory,
    currentWindow: null,
    heldItem: diamond,
    equip: async (item, destination) => calls.push(['equip', item.slot, destination]),
    setQuickBarSlot: (slot) => calls.push(['select', slot]),
    activateItem: (offhand) => calls.push(['use', offhand]),
    transfer: async (options) => calls.push(['transfer', options]),
    clickWindow: async (...args) => calls.push(['click', ...args]),
    closeWindow: (window) => calls.push(['close', window.id])
  };
  const client = { bot, connectionAttempt: 7 };
  let changes = 0;
  const service = new InventoryService({ getClient: () => client, onChange: () => { changes += 1; } });
  return { bot, calls, client, service, get changes() { return changes; } };
}

test('manages inventory items through validated actions', async () => {
  const context = fixture();
  const inspected = await context.service.execute({ scope: 'inventory', action: 'inspect', target: '36', connectionId: 7, windowId: null });
  assert.match(inspected.message, /Name: diamond/u);
  await context.service.execute({ scope: 'inventory', action: 'equip', target: 'diamond', destination: 'hand' });
  await context.service.execute({ scope: 'inventory', action: 'select', target: 2 });
  await context.service.execute({ scope: 'inventory', action: 'use', target: '36' });
  await assert.rejects(context.service.execute({ scope: 'inventory', action: 'drop', target: 'diamond', quantity: 'all' }), /Confirm this action/u);
  await context.service.execute({ scope: 'inventory', action: 'drop', target: 'diamond', quantity: 'all', confirmed: true });
  assert.deepEqual(context.calls.slice(0, 3), [['equip', 36, 'hand'], ['select', 2], ['equip', 36, 'hand']]);
  assert.equal(context.calls.some((call) => call[0] === 'use'), true);
  assert.equal(context.calls.some((call) => call[0] === 'transfer' && call[1].destStart === -999), true);
  assert.equal(context.changes, 6);
});

test('transfers container items and rejects stale views', async () => {
  const context = fixture();
  const slots = Array(46).fill(null);
  slots[2] = { slot: 2, name: 'apple', displayName: 'Apple', count: 5, type: 2, metadata: 0 };
  slots[9] = { slot: 9, name: 'diamond', displayName: 'Diamond', count: 3, type: 1, metadata: 0 };
  context.bot.currentWindow = windowFixture(4, 9, 46, slots);
  await context.service.execute({ scope: 'container', action: 'take', target: '2', quantity: 'one', connectionId: 7, windowId: 4 });
  await context.service.execute({ scope: 'container', action: 'deposit', target: 'diamond', quantity: 'stack', connectionId: 7, windowId: 4 });
  await context.service.execute({ scope: 'container', action: 'quick-move', target: '2', connectionId: 7, windowId: 4 });
  await context.service.execute({ scope: 'container', action: 'click', target: '2', button: 'right', connectionId: 7, windowId: 4 });
  await assert.rejects(context.service.execute({ scope: 'container', action: 'inspect', target: '2', connectionId: 6, windowId: 4 }), /earlier connection/u);
  await assert.rejects(context.service.execute({ scope: 'container', action: 'inspect', target: '2', connectionId: 7, windowId: 5 }), /container changed/u);
  await context.service.execute({ scope: 'container', action: 'close', connectionId: 7, windowId: 4 });
  const transfers = context.calls.filter((call) => call[0] === 'transfer').map((call) => call[1]);
  assert.equal(transfers[0].count, 1);
  assert.deepEqual([transfers[0].sourceStart, transfers[0].destStart], [2, 9]);
  assert.deepEqual([transfers[1].sourceStart, transfers[1].destStart], [9, 0]);
  assert.equal(context.calls.some((call) => call[0] === 'click' && call[3] === 1), true);
  assert.equal(context.calls.some((call) => call[0] === 'click' && call[2] === 1 && call[3] === 0), true);
  assert.equal(context.calls.some((call) => call[0] === 'close' && call[1] === 4), true);
});
