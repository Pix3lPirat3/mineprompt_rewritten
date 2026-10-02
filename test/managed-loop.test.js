'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ActivityManager } = require('../src/main/activity-manager');
const { startManagedLoop } = require('../src/main/managed-loop');

test('runs sequential activity-owned loop iterations', async () => {
  const activities = new ActivityManager();
  const scheduled = [];
  let iterations = 0;
  startManagedLoop({
    activities,
    id: 'sample',
    run: async () => {
      iterations += 1;
      return iterations === 2 ? false : 25;
    },
    delay: 100,
    schedule: (callback, delay) => { scheduled.push({ callback, delay }); return callback; },
    cancel() {}
  });
  assert.equal(scheduled[0].delay, 0);
  await scheduled.shift().callback();
  assert.equal(scheduled[0].delay, 25);
  await scheduled.shift().callback();
  assert.equal(iterations, 2);
  assert.equal(activities.has('sample'), false);
  assert.equal(scheduled.length, 0);
});

test('contains loop errors and cancels scheduled work', async () => {
  const activities = new ActivityManager();
  const errors = [];
  const canceled = [];
  const scheduled = [];
  startManagedLoop({
    activities,
    id: 'sample',
    run: () => { throw new Error('Iteration failed'); },
    delay: 50,
    onError: (error) => errors.push(error.message),
    schedule: (callback, delay) => { const handle = { callback, delay }; scheduled.push(handle); return handle; },
    cancel: (handle) => canceled.push(handle)
  });
  await scheduled.shift().callback();
  assert.deepEqual(errors, ['Iteration failed']);
  assert.equal(scheduled[0].delay, 50);
  activities.stop('sample');
  assert.equal(canceled.length, 1);
});
