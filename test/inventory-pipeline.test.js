'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { InventoryPipeline } = require('../src/main/inventory-pipeline');

test('coalesces transient inventory bursts into the latest complete snapshot', () => {
  const published = [];
  let scheduled = null;
  let snapshots = 0;
  const pipeline = new InventoryPipeline({
    snapshot: () => ({ revision: ++snapshots }),
    publish: (payload) => published.push(payload),
    schedule: (callback) => { scheduled = callback; return 1; },
    cancel: () => { scheduled = null; }
  });
  pipeline.receive({ revision: 1, type: 'update', scope: 'inventory' });
  pipeline.receive({ revision: 2, type: 'update', scope: 'inventory' });
  pipeline.receive({ revision: 3, type: 'property', scope: 'container' });
  assert.equal(published.length, 0);
  scheduled();
  assert.equal(published.length, 1);
  assert.equal(published[0].event.revision, 3);
  assert.equal(published[0].pipeline.received, 3);
  assert.equal(published[0].pipeline.published, 1);
  assert.equal(published[0].pipeline.coalesced, 2);
  assert.equal(snapshots, 1);
});

test('publishes lifecycle events immediately and supersedes pending slot updates', () => {
  const published = [];
  let canceled = 0;
  const pipeline = new InventoryPipeline({
    snapshot: () => ({ current: true }),
    publish: (payload) => published.push(payload),
    schedule: () => 1,
    cancel: () => { canceled += 1; }
  });
  pipeline.receive({ revision: 1, type: 'update', scope: 'inventory' });
  pipeline.receive({ revision: 2, type: 'close', scope: 'container' });
  assert.equal(canceled, 1);
  assert.equal(published.length, 1);
  assert.equal(published[0].event.type, 'close');
  assert.equal(published[0].pipeline.coalesced, 1);
  pipeline.close();
});
