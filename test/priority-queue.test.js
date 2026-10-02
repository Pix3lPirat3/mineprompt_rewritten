'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PriorityQueue } = require('../src/main/priority-queue');

test('keeps arbitrary insertions in deterministic priority order', () => {
  const queue = new PriorityQueue((left, right) => left.priority - right.priority || left.id.localeCompare(right.id));
  for (const value of [{ id: 'c', priority: 2 }, { id: 'b', priority: 1 }, { id: 'a', priority: 1 }, { id: 'd', priority: -1 }]) queue.push(value);
  assert.deepEqual([queue.shift(), queue.shift(), queue.shift(), queue.shift()].map((value) => value.id), ['d', 'a', 'b', 'c']);
  assert.equal(queue.shift(), undefined);
});

test('clears queued values without changing its comparator', () => {
  const queue = new PriorityQueue((left, right) => left - right);
  queue.push(3);
  queue.push(1);
  queue.clear();
  queue.push(2);
  queue.push(1);
  assert.equal(queue.size, 2);
  assert.equal(queue.shift(), 1);
});
