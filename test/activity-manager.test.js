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

test('allows bounded child work to share and retain parent resources', () => {
  const manager = new ActivityManager();
  manager.register('builder', { resources: ['movement', 'inventory', 'world'], stop() {} });
  manager.register('storage', { parent: 'builder', resources: ['movement', 'inventory'], stop() {} });
  assert.equal(manager.snapshot().find((entry) => entry.id === 'storage').parent, 'builder');
  assert.throws(() => manager.register('mine', { resources: ['movement'], stop() {} }), /movement is already in use by builder/u);
  manager.stop('builder');
  assert.throws(() => manager.register('mine', { resources: ['movement'], stop() {} }), /movement is already in use by storage/u);
  manager.stop('storage');
  manager.register('mine', { resources: ['movement'], stop() {} });
  assert.equal(manager.has('mine'), true);
});

test('rejects a child whose parent is not active', () => {
  const manager = new ActivityManager();
  assert.throws(() => manager.register('child', { parent: 'missing', resources: ['movement'], stop() {} }), /Parent activity missing is not active/u);
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
