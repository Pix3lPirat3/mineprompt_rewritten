'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { itemIdentity, itemsMatch, valueIdentity } = require('../src/main/item-identity');

test('matches equivalent item data regardless of object key order', () => {
  const left = { type: 1, metadata: 0, nbt: { value: { name: 'tool', level: 2 } }, components: [{ type: 'damage', data: { value: 4, show: true } }] };
  const right = { type: 1, metadata: 0, nbt: { value: { level: 2, name: 'tool' } }, components: [{ data: { show: true, value: 4 }, type: 'damage' }] };
  assert.equal(itemsMatch(left, right), true);
  assert.equal(itemIdentity(left), itemIdentity(right));
});

test('keeps component variants in separate item stacks', () => {
  const left = { type: 1, metadata: 0, nbt: null, components: [{ type: 'custom_name', data: 'First' }] };
  const right = { type: 1, metadata: 0, nbt: null, components: [{ type: 'custom_name', data: 'Second' }] };
  assert.equal(itemsMatch(left, right), false);
});

test('treats protocol component order as insignificant', () => {
  const left = { type: 1, components: [{ type: 'damage', data: 2 }, { type: 'custom_name', data: 'Tool' }] };
  const right = { type: 1, components: [{ type: 'custom_name', data: 'Tool' }, { type: 'damage', data: 2 }] };
  assert.equal(itemsMatch(left, right), true);
});

test('contains cyclic and binary values', () => {
  const value = { bytes: Buffer.from([1, 2, 3]) };
  value.self = value;
  assert.match(valueIdentity(value), /buffer:AQID/u);
  assert.match(valueIdentity(value), /circular/u);
});
