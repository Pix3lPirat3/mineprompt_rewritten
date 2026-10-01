'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Vec3 } = require('vec3');
const { ActivityManager } = require('../src/main/activity-manager');
const { MiningService } = require('../src/main/mining-service');

function fixture() {
  const queue = [];
  const logs = [];
  const locked = new Vec3(1, 64, 0);
  const air = (position) => ({ name: 'air', displayName: 'Air', position, diggable: false });
  let current = { name: 'stone', displayName: 'Stone', position: locked, diggable: true, hardness: 1.5, harvestTools: {} };
  let now = 0;
  const bot = {
    entity: { position: new Vec3(0, 64, 0), eyeHeight: 1.62 },
    inventory: { items: () => [] },
    heldItem: null,
    pathfinder: { bestHarvestTool: () => null },
    blockAt(position) { return position.equals(locked) ? current : air(position); },
    dig: async (block) => { logs.push(['dig', block.name]); },
    stopDigging: async () => { logs.push(['stop-digging']); }
  };
  const activities = new ActivityManager();
  const service = new MiningService({
    getClient: () => ({ bot }),
    activities,
    logger: { warn: (message) => logs.push(['warn', message]) },
    schedule: (callback) => { queue.push(callback); return callback; },
    cancelSchedule: (callback) => { const index = queue.indexOf(callback); if (index >= 0) queue.splice(index, 1); },
    now: () => now,
    blockedTimeout: 10000
  });
  return {
    activities,
    locked,
    logs,
    queue,
    service,
    setBlock(name, diggable) { current = { name, displayName: name === 'bedrock' ? 'Bedrock' : 'Stone', position: locked, diggable, hardness: 1.5, harvestTools: {} }; },
    setNow(value) { now = value; }
  };
}

test('waits through a transient non-diggable block at a locked mining position', async () => {
  const value = fixture();
  value.service.startConsistent(value.service.bot.blockAt(value.locked), 1);
  value.setBlock('bedrock', false);
  await value.queue.shift()();
  assert.equal(value.activities.has('consistentmine'), true);
  assert.match(value.activities.snapshot()[0].detail, /temporary bedrock/u);
  value.setNow(250);
  value.setBlock('stone', true);
  await value.queue.shift()();
  assert.equal(value.activities.has('consistentmine'), true);
  assert.equal(value.logs.some((entry) => entry[0] === 'dig' && entry[1] === 'stone'), true);
  value.activities.stop('consistentmine');
});

test('stops when a non-diggable replacement remains at the locked position', async () => {
  const value = fixture();
  value.service.startConsistent(value.service.bot.blockAt(value.locked), 1);
  value.setBlock('bedrock', false);
  await value.queue.shift()();
  value.setNow(10001);
  await value.queue.shift()();
  assert.equal(value.activities.has('consistentmine'), false);
  assert.equal(value.logs.some((entry) => entry[0] === 'warn' && entry[1].includes('remained at the locked position')), true);
});
