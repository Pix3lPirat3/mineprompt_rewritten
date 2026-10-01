'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { InventoryEventStream } = require('../src/main/inventory-events');

function windowFixture() {
  const window = new EventEmitter();
  Object.assign(window, {
    id: 7,
    type: 'minecraft:hopper',
    inventoryStart: 5,
    inventoryEnd: 41,
    hotbarStart: 32,
    slots: Array(41).fill(null)
  });
  return window;
}

test('publishes structured inventory window events', () => {
  const events = [];
  const stream = new InventoryEventStream((event) => events.push(event));
  const window = windowFixture();
  stream.open(window, 'Item Hopper');
  const item = { slot: 2, name: 'diamond', displayName: 'Diamond', count: 3 };
  window.emit('updateSlot', 2, null, item);
  window.emit('updateSlot', 7, null, { ...item, slot: 7 });
  stream.property(window, 1, 24);
  stream.select(4);
  stream.close(window, 'Item Hopper');
  window.emit('updateSlot', 2, item, null);

  assert.deepEqual(events.map((event) => event.type), ['open', 'update', 'update', 'property', 'selection', 'close']);
  assert.equal(events[0].window.kind, 'hopper');
  assert.equal(events[1].slot, 2);
  assert.equal(events[1].current.name, 'diamond');
  assert.equal(Number.isFinite(events[1].processing.itemSerializationMs), true);
  assert.equal(events[2].scope, 'inventory');
  assert.equal(events[2].slot, 11);
  assert.equal(events[3].property, 1);
  assert.equal(events[3].propertyName, 'property1');
  assert.equal(events[3].value, 24);
  assert.equal(events[4].slot, 4);
  assert.equal(events[5].windowId, 7);
  assert.deepEqual(events.map((event) => event.revision), [1, 2, 3, 4, 5, 6]);
});

test('resets listeners and revision state', () => {
  const events = [];
  const stream = new InventoryEventStream((event) => events.push(event));
  const window = windowFixture();
  stream.watch(window, 'inventory');
  stream.reset();
  window.emit('updateSlot', 0, null, null);
  stream.select(0);
  assert.equal(events.length, 1);
  assert.equal(events[0].revision, 1);
});
