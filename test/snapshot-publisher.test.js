'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { SnapshotPublisher } = require('../src/main/snapshot-publisher');

test('coalesces snapshot requests into the latest complete view', () => {
  const published = [];
  let scheduled = null;
  let revision = 0;
  const publisher = new SnapshotPublisher({
    capture: () => ({ revision }),
    publish: (snapshot) => published.push(snapshot),
    schedule: (callback) => { scheduled = callback; return 1; },
    cancel: () => { scheduled = null; }
  });
  revision = 1;
  assert.equal(publisher.request(), true);
  revision = 2;
  assert.equal(publisher.request(), false);
  scheduled();
  assert.deepEqual(published, [{ revision: 2 }]);
  const metrics = publisher.snapshot();
  assert.equal(metrics.requested, 2);
  assert.equal(metrics.published, 1);
  assert.equal(metrics.failed, 0);
  assert.equal(metrics.coalesced, 1);
  assert.equal(metrics.pending, false);
  assert.equal(metrics.lastDurationMs >= 0, true);
  assert.equal(metrics.peakDurationMs >= metrics.lastDurationMs, true);
});

test('contains capture failures and remains reusable', () => {
  const errors = [];
  let fail = true;
  const publisher = new SnapshotPublisher({
    capture: () => {
      if (fail) throw new Error('Capture failed');
      return 'recovered';
    },
    publish() {},
    onError: (error) => errors.push(error.message),
    schedule: () => 1,
    cancel() {}
  });
  publisher.request();
  assert.equal(publisher.flush(), false);
  fail = false;
  publisher.request();
  assert.equal(publisher.flush(), true);
  assert.deepEqual(errors, ['Capture failed']);
  assert.equal(publisher.snapshot().failed, 1);
  assert.equal(publisher.snapshot().published, 1);
});

test('flushes immediately and ignores work after close', () => {
  const published = [];
  let canceled = 0;
  const publisher = new SnapshotPublisher({
    capture: () => 'current',
    publish: (snapshot) => published.push(snapshot),
    schedule: () => 7,
    cancel: () => { canceled += 1; }
  });
  publisher.request();
  assert.equal(publisher.flush(), true);
  assert.equal(canceled, 1);
  assert.deepEqual(published, ['current']);
  publisher.close();
  assert.equal(publisher.request(), false);
  assert.equal(publisher.flush(), false);
});
