'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const loader = require('prismarine-item');
const minecraftData = require('minecraft-data');

test('keeps modern component variants separate in Prismarine windows', () => {
  const registry = minecraftData('1.21.11');
  const Item = loader(registry);
  const left = new Item(1, 1, 0, null, null, true);
  const right = new Item(1, 1, 0, null, null, true);
  left.components = [{ type: 'custom_name', data: 'First' }];
  right.components = [{ type: 'custom_name', data: 'Second' }];
  assert.equal(Item.equal(left, right), false);
  left.components = [{ type: 'damage', data: 2 }, { type: 'custom_name', data: 'First' }];
  right.components = [{ type: 'custom_name', data: 'First' }, { type: 'damage', data: 2 }];
  assert.equal(Item.equal(left, right), true);
});
