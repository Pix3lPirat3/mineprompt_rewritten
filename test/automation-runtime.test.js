'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ActivityManager } = require('../src/main/activity-manager');
const { AutomationRuntime } = require('../src/main/automation-runtime');

test('runs an asynchronous state machine and releases its resources', async () => {
  const activities = new ActivityManager();
  const errors = [];
  const runtime = new AutomationRuntime(activities, { error: (message) => errors.push(message) });
  let finish;
  const pending = new Promise((resolve) => { finish = resolve; });
  assert.deepEqual(runtime.start({ id: 'route', label: 'Route', resources: ['movement'], run: () => pending }), { id: 'route', state: 'running' });
  assert.equal(activities.has('route'), true);
  finish();
  await new Promise((resolve) => { setTimeout(resolve, 0); });
  assert.equal(activities.has('route'), false);
  assert.deepEqual(errors, []);
});

test('aborts a stopped state machine', async () => {
  const activities = new ActivityManager();
  const runtime = new AutomationRuntime(activities, { error() {} });
  let aborted = false;
  runtime.start({
    id: 'watch',
    label: 'Watch',
    resources: ['world'],
    run: (signal) => new Promise((resolve) => {
      signal.addEventListener('abort', () => { aborted = true; resolve(); }, { once: true });
    })
  });
  assert.equal(runtime.stop('watch'), true);
  await new Promise((resolve) => { setTimeout(resolve, 0); });
  assert.equal(aborted, true);
  assert.equal(runtime.snapshot('watch'), null);
});
