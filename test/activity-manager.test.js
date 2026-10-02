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

test('prevents activities from competing for exclusive resources', () => {
  const manager = new ActivityManager();
  manager.register('follow', { label: 'Follow', resources: ['movement'], stop() {} });
  assert.throws(
    () => manager.register('mine', { label: 'Mine', resources: ['movement', 'world'], stop() {} }),
    /movement is already in use by follow/u
  );
  manager.stop('follow');
  manager.register('mine', { label: 'Mine', resources: ['movement', 'world'], stop() {} });
  assert.deepEqual(manager.snapshot()[0].resources, ['movement', 'world']);
});

test('supports independent activity subscribers', () => {
  const manager = new ActivityManager();
  const revisions = [];
  const unsubscribe = manager.subscribe((snapshot, revision) => revisions.push([snapshot.length, revision]));
  manager.register('one', { label: 'One', stop() {} });
  unsubscribe();
  manager.stop('one');
  assert.deepEqual(revisions, [[0, 0], [1, 1]]);
});

test('contains subscriber failures and continues notifying observers', () => {
  const errors = [];
  const snapshots = [];
  const manager = new ActivityManager(() => {}, (error) => errors.push(error.message));
  manager.subscribe(() => { throw new Error('Observer failed'); }, false);
  manager.subscribe((snapshot) => snapshots.push(snapshot), false);
  manager.register('safe', { stop() {} });
  assert.deepEqual(errors, ['Observer failed']);
  assert.equal(snapshots.length, 1);
  assert.equal(manager.has('safe'), true);
});
