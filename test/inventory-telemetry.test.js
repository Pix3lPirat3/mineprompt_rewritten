'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { InventoryPipelineTelemetry } = require('../src/main/inventory-telemetry');

test('measures inventory event rates and serialization costs', () => {
  let now = 1000;
  const telemetry = new InventoryPipelineTelemetry(() => now);
  telemetry.observe({ revision: 1, type: 'update', scope: 'inventory', processing: { itemSerializationMs: 1.25 } });
  telemetry.publish(2.5);
  now = 1100;
  telemetry.observe({ revision: 2, type: 'update', scope: 'inventory', processing: { itemSerializationMs: 0.75 } });
  telemetry.publish(1.5);
  const snapshot = telemetry.snapshot();
  assert.equal(snapshot.received, 2);
  assert.equal(snapshot.published, 2);
  assert.equal(snapshot.coalesced, 0);
  assert.equal(snapshot.eventsPerSecond, 2);
  assert.equal(snapshot.publicationsPerSecond, 2);
  assert.equal(snapshot.peakEventsPerSecond, 2);
  assert.equal(snapshot.byType.update, 2);
  assert.equal(snapshot.itemSerialization.averageMs, 1);
  assert.equal(snapshot.inventorySnapshotSerialization.maximumMs, 2.5);
  now = 2500;
  assert.equal(telemetry.snapshot().eventsPerSecond, 0);
});

test('starts a new measurement series when inventory revisions reset', () => {
  const telemetry = new InventoryPipelineTelemetry(() => 1000);
  telemetry.observe({ revision: 4, type: 'update', scope: 'inventory' });
  telemetry.publish(1);
  telemetry.observe({ revision: 1, type: 'open', scope: 'container' });
  telemetry.publish(2);
  const snapshot = telemetry.snapshot();
  assert.equal(snapshot.received, 1);
  assert.equal(snapshot.published, 1);
  assert.equal(snapshot.lastRevision, 1);
  assert.deepEqual(snapshot.byType, { open: 1 });
});
