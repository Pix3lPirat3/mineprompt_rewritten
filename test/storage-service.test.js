'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Vec3 } = require('vec3');
const { ActivityManager } = require('../src/main/activity-manager');
const { StorageService, pairedStoragePosition } = require('../src/main/storage-service');

function block(name, x, y, z, properties = {}) {
  return {
    name,
    position: new Vec3(x, y, z),
    getProperties: () => properties
  };
}

function setup(options = {}) {
  const zone = {
    id: 'warehouse',
    name: 'Warehouse',
    server: { host: 'example.test', port: 25565 },
    dimension: 'minecraft:overworld',
    from: { x: 1, y: 64, z: 1 },
    to: { x: 4, y: 64, z: 1 },
    createdAt: 1,
    updatedAt: 1
  };
  const blocks = new Map([
    ['1,64,1', block('chest', 1, 64, 1, { type: 'left', facing: 'north' })],
    ['2,64,1', block('chest', 2, 64, 1, { type: 'right', facing: 'north' })],
    ['3,64,1', block('barrel', 3, 64, 1)],
    ['4,64,1', block('barrel', 4, 64, 1)]
  ]);
  const windows = [];
  const items = {
    '1,64,1': [
      { type: 5, metadata: 0, name: 'oak_planks', displayName: 'Oak Planks', count: 32, stackSize: 64 },
      { type: 5, metadata: 0, name: 'oak_planks', displayName: 'Named Planks', count: 2, stackSize: 64, nbt: { value: { name: 'Named' } } }
    ],
    '3,64,1': [{ type: 5, metadata: 0, name: 'oak_planks', displayName: 'Oak Planks', count: 16, stackSize: 64 }],
    '4,64,1': [{ type: 1, metadata: 0, name: 'stone', displayName: 'Stone', count: 64, stackSize: 64 }]
  };
  const bot = {
    entity: { position: new Vec3(0, 64, 0), dimension: 'overworld' },
    game: { dimension: 'overworld' },
    lastOptions: { host: 'Example.Test', port: 25565 },
    registry: null,
    currentWindow: null,
    blockAt(position) {
      return blocks.get(`${position.x},${position.y},${position.z}`) || block('air', position.x, position.y, position.z);
    },
    async lookAt() {},
    async openContainer(target) {
      const key = `${target.position.x},${target.position.y},${target.position.z}`;
      if (options.failPosition === key) throw new Error('Container is locked.');
      const window = {
        inventoryStart: 27,
        containerItems: () => items[key] || [],
        async close() { this.closed = true; }
      };
      windows.push(window);
      return window;
    },
    async waitForTicks() {}
  };
  const client = { bot, connectionAttempt: 3, chatMessageClass: null };
  const store = {
    data: { storageZones: [zone] },
    snapshot() { return structuredClone(this.data); },
    async saveStorageZone(value) { this.data.storageZones = [value]; return value; },
    async removeStorageZone() { this.data.storageZones = []; return true; }
  };
  const activities = new ActivityManager();
  const logs = [];
  const service = new StorageService({
    getClient: () => client,
    store,
    activities,
    logger: { log: (message) => logs.push(message), warn: (message) => logs.push(message) }
  });
  return { activities, blocks, bot, client, logs, service, store, windows, zone };
}

async function waitForScan(service) {
  for (let count = 0; count < 50 && service.active; count += 1) {
    await new Promise((resolve) => { globalThis.setTimeout(resolve, 0); });
  }
  if (service.active) throw new Error('Storage scan did not finish.');
}

test('canonicalizes paired chests to one scan target', () => {
  const left = block('chest', 5, 64, 5, { type: 'left', facing: 'south' });
  const right = block('chest', 6, 64, 5, { type: 'right', facing: 'south' });
  const lookup = (position) => position.x === 5 ? left : position.x === 6 ? right : null;
  assert.deepEqual(pairedStoragePosition(left, lookup), { x: 5, y: 64, z: 5 });
  assert.deepEqual(pairedStoragePosition(right, lookup), { x: 5, y: 64, z: 5 });
});

test('scans containers once and keeps exact item variants separate', async () => {
  const { client, service, windows } = setup();
  const started = service.start('warehouse');
  assert.equal(started.running, true);
  await waitForScan(service);
  const result = service.inspect('warehouse').scan;
  assert.equal(result.containersFound, 3);
  assert.equal(result.containersScanned, 3);
  assert.equal(windows.length, 3);
  assert.equal(result.complete, true);
  assert.equal(result.items.length, 3);
  assert.deepEqual(result.items.filter((item) => item.name === 'oak_planks').map((item) => item.count).sort((a, b) => a - b), [2, 48]);
  assert.equal(result.items.some((item) => Object.hasOwn(item, 'identity')), false);
  assert.equal(service.find('oak', { minimum: 10 }).length, 1);
  client.connectionAttempt += 1;
  assert.equal(service.inspect('warehouse').scan.stale, true);
});

test('records inaccessible containers and continues scanning', async () => {
  const { service, windows } = setup({ failPosition: '3,64,1' });
  service.start('warehouse');
  await waitForScan(service);
  const result = service.inspect('warehouse').scan;
  assert.equal(result.complete, false);
  assert.equal(result.containersScanned, 2);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].message, 'Container is locked.');
  assert.equal(windows.every((window) => window.closed), true);
});
