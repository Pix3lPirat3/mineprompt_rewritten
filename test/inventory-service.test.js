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
    swingArm: (...args) => calls.push(['swing', ...args]),
    transfer: async (options) => calls.push(['transfer', options]),
    clickWindow: async (...args) => calls.push(['click', ...args]),
    closeWindow: (window) => calls.push(['close', window.id])
  };
  const client = { bot, connectionAttempt: 7, inventoryEvents: { revision: 11 } };
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
  await context.service.execute({ scope: 'container', action: 'transfer', target: '2', connectionId: 7, windowId: 4 });
  await context.service.execute({ scope: 'container', action: 'click', target: '2', button: 'right', connectionId: 7, windowId: 4 });
  await assert.rejects(context.service.execute({ scope: 'container', action: 'inspect', target: '2', connectionId: 6, windowId: 4 }), /earlier connection/u);
  await assert.rejects(context.service.execute({ scope: 'container', action: 'inspect', target: '2', connectionId: 7, windowId: 5 }), /container changed/u);
  await context.service.execute({ scope: 'container', action: 'close', connectionId: 7, windowId: 4 });
  const transfers = context.calls.filter((call) => call[0] === 'transfer').map((call) => call[1]);
  assert.equal(transfers[0].count, 1);
  assert.deepEqual([transfers[0].sourceStart, transfers[0].destStart], [2, 9]);
  assert.deepEqual([transfers[1].sourceStart, transfers[1].destStart], [36, 0]);
  assert.equal(context.calls.some((call) => call[0] === 'click' && call[3] === 1), true);
  assert.equal(context.calls.some((call) => call[0] === 'click' && call[2] === 1 && call[3] === 0), true);
  assert.equal(context.calls.some((call) => call[0] === 'close' && call[1] === 4), true);
});

test('equips an inventory item before swinging the requested arm', async () => {
  const context = fixture();
  const result = await context.service.execute({ scope: 'inventory', action: 'swing', target: '36', arm: 'left', showHand: true });
  assert.deepEqual(context.calls, [['equip', 36, 'off-hand'], ['swing', 'left', true]]);
  assert.match(result.message, /Swung Diamond with the left arm/u);
  await assert.rejects(context.service.execute({ scope: 'inventory', action: 'swing', arm: 'middle' }), /left or right/u);
});

test('serializes gesture transfers and validates inventory revisions', async () => {
  const context = fixture();
  const slots = Array(46).fill(null);
  slots[0] = { slot: 0, name: 'apple', displayName: 'Apple', count: 5, type: 2, metadata: 0 };
  slots[36] = { slot: 36, name: 'diamond', displayName: 'Diamond', count: 3, type: 1, metadata: 0 };
  context.bot.currentWindow = windowFixture(4, 9, 46, slots);
  await context.service.execute({ scope: 'container', action: 'transfer', sourceScope: 'inventory', target: '36', quantity: 'half', connectionId: 7, windowId: 4, expectedRevision: 11 });
  await context.service.execute({ scope: 'container', action: 'move', fromScope: 'inventory', fromSlot: 36, toScope: 'container', toSlot: 1, connectionId: 7, windowId: 4, expectedRevision: 11 });
  await assert.rejects(context.service.execute({ scope: 'container', action: 'move', fromScope: 'inventory', fromSlot: 36, toScope: 'container', toSlot: 1, connectionId: 7, windowId: 4, expectedRevision: 10 }), /inventory changed/u);
  const transfer = context.calls.find((call) => call[0] === 'transfer');
  assert.equal(transfer[1].count, 2);
  assert.deepEqual([transfer[1].sourceStart, transfer[1].destStart], [36, 0]);
  assert.equal(context.calls.some((call) => call[0] === 'click' && call[1] === 36), true);
  assert.equal(context.calls.some((call) => call[0] === 'click' && call[1] === 1), true);
});

test('runs villager trades through the shared container action', async () => {
  const context = fixture();
  const slots = Array(46).fill(null);
  const trades = [{ disabled: false }];
  const window = windowFixture(5, 3, 40, slots);
  window.trades = trades;
  window.trade = async (index, count) => context.calls.push(['trade', index, count]);
  context.bot.currentWindow = window;
  await context.service.execute({ scope: 'container', action: 'trade', tradeIndex: 0, count: 2, connectionId: 7, windowId: 5 });
  assert.equal(context.calls.some((call) => call[0] === 'trade' && call[1] === 0 && call[2] === 2), true);
});

test('uses high-level workstation operations', async () => {
  const context = fixture();
  const window = windowFixture(6, 3, 40, Array(46).fill(null));
  window.putInput = async (...args) => context.calls.push(['put-input', ...args]);
  window.takeOutput = async () => ({ name: 'glass', displayName: 'Glass', count: 3 });
  context.bot.currentWindow = window;
  await context.service.execute({ scope: 'container', action: 'workstation', operation: 'put-input', target: 'diamond', count: 2 });
  const output = await context.service.execute({ scope: 'container', action: 'workstation', operation: 'take-output' });
  assert.deepEqual(context.calls.find((call) => call[0] === 'put-input'), ['put-input', 1, 0, 2]);
  assert.match(output.message, /3 x Glass/u);

  window.enchant = async (choice) => {
    context.calls.push(['enchant', choice]);
    return { name: 'diamond', displayName: 'Diamond' };
  };
  const enchanted = await context.service.execute({ scope: 'container', action: 'workstation', operation: 'enchant', choice: 1 });
  assert.equal(context.calls.some((call) => call[0] === 'enchant' && call[1] === 1), true);
  assert.match(enchanted.message, /choice 2/u);

  context.bot.inventory.slots[37] = { slot: 37, name: 'diamond_sword', displayName: 'Diamond Sword', count: 1, type: 2, metadata: 0 };
  window.combine = async (...items) => context.calls.push(['combine', ...items]);
  window.rename = async (...items) => context.calls.push(['rename', ...items]);
  await context.service.execute({ scope: 'container', action: 'workstation', operation: 'combine', first: 'diamond', second: 'diamond_sword', name: 'Tool' });
  await context.service.execute({ scope: 'container', action: 'workstation', operation: 'rename', target: 'diamond_sword', name: 'Miner' });
  assert.equal(context.calls.some((call) => call[0] === 'combine' && call[1].name === 'diamond' && call[2].name === 'diamond_sword' && call[3] === 'Tool'), true);
  assert.equal(context.calls.some((call) => call[0] === 'rename' && call[1].name === 'diamond_sword' && call[2] === 'Miner'), true);
});
