'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ActivityManager } = require('../src/main/activity-manager');

test('owns activity replacement and cleanup', () => {
  const snapshots = [];
  const stopped = [];
  const manager = new ActivityManager((snapshot) => snapshots.push(snapshot));
  manager.register('worker', { label: 'Worker', detail: 'First', stop: () => stopped.push('first') });
  manager.register('worker', { label: 'Worker', detail: 'Second', stop: () => stopped.push('second') });
  assert.deepEqual(stopped, ['first']);
  assert.equal(manager.snapshot()[0].detail, 'Second');
  assert.equal(manager.has('worker'), true);
  manager.stopAll();
  assert.deepEqual(stopped, ['first', 'second']);
  assert.deepEqual(manager.snapshot(), []);
  assert.equal(snapshots.length >= 3, true);
});
