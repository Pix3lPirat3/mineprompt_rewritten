'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Vec3 } = require('vec3');
const { ActivityManager } = require('../src/main/activity-manager');
const { StorageService, pairedStoragePosition } = require('../src/main/storage-service');
const { StorageReservationBroker } = require('../src/main/storage-reservations');

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
    categories: [],
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
      { slot: 0, type: 5, metadata: 0, name: 'oak_planks', displayName: 'Oak Planks', count: 32, stackSize: 64 },
      { slot: 1, type: 5, metadata: 0, name: 'oak_planks', displayName: 'Named Planks', count: 2, stackSize: 64, nbt: { value: { name: 'Named' } } }
    ],
    '3,64,1': [{ slot: 0, type: 5, metadata: 0, name: 'oak_planks', displayName: 'Oak Planks', count: 16, stackSize: 64 }],
    '4,64,1': [{ slot: 0, type: 1, metadata: 0, name: 'stone', displayName: 'Stone', count: 64, stackSize: 64 }]
  };
  const transfers = [];
  const inventoryItems = (options.inventoryItems || []).map((item) => ({ ...item }));
  const playerWindowSlot = (slot) => slot >= 9 && slot <= 35 ? 27 + slot - 9 : slot >= 36 && slot <= 44 ? 54 + slot - 36 : -1;
  const bot = {
    entity: { position: new Vec3(0, 64, 0), dimension: 'overworld' },
    game: { dimension: 'overworld' },
    lastOptions: { host: 'Example.Test', port: 25565 },
    registry: null,
    inventory: { items: () => inventoryItems.filter((item) => item.count > 0) },
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
        inventoryEnd: 63,
        storageKey: key,
        containerItems: () => (items[key] || []).filter((item) => item.count > 0),
        items() {
          return [...this.containerItems(), ...inventoryItems.filter((item) => item.count > 0).map((item) => ({ ...item, slot: playerWindowSlot(item.slot) }))];
        },
        async close() { this.closed = true; }
      };
      Object.defineProperty(window, 'slots', {
        get() {
          const slots = new Array(this.inventoryEnd).fill(null);
          for (const item of this.items()) slots[item.slot] = item;
          return slots;
        }
      });
      windows.push(window);
      return window;
    },
    async transfer(request) {
      if (request.sourceStart < request.window.inventoryStart) {
        const item = request.window.containerItems().find((entry) => entry.slot === request.sourceStart);
        if (!item || item.count < request.count) throw new Error('Transfer source changed.');
        item.count -= request.count;
        const target = inventoryItems.find((entry) => entry.type === item.type && entry.metadata === item.metadata && JSON.stringify(entry.nbt || null) === JSON.stringify(item.nbt || null));
        if (target) target.count += request.count;
        else inventoryItems.push({ ...item, slot: 9 + inventoryItems.length, count: request.count });
      } else {
        const sourceView = request.window.items().find((entry) => entry.slot === request.sourceStart);
        const source = inventoryItems.find((entry) => playerWindowSlot(entry.slot) === request.sourceStart);
        if (!source || !sourceView || source.count < request.count) throw new Error('Transfer source changed.');
        source.count -= request.count;
        const destinationItems = items[request.window.storageKey] || (items[request.window.storageKey] = []);
        const target = destinationItems.find((entry) => entry.slot === request.destStart);
        if (target) target.count += request.count;
        else destinationItems.push({ ...sourceView, slot: request.destStart, count: request.count });
      }
      transfers.push(request);
    },
    async waitForTicks() {}
  };
  const client = { bot, connectionAttempt: 3, chatMessageClass: null };
  const store = {
    data: { storageZones: [zone] },
    reservations: new StorageReservationBroker(),
    snapshot() { return structuredClone(this.data); },
    async saveStorageZone(value) { this.data.storageZones = [value]; return value; },
    async removeStorageZone() { this.data.storageZones = []; return true; },
    storageReservationSnapshot(request) { return this.reservations.snapshot(request); },
    reserveStorage(request) { return this.reservations.reserve(request); },
    renewStorageReservation(id, owner, ttlMs) { return this.reservations.renew(id, owner, ttlMs); },
    releaseStorageReservation(id, owner) { return this.reservations.release(id, owner); }
  };
  const activities = new ActivityManager();
  const logs = [];
  const service = new StorageService({
    getClient: () => client,
    store,
    activities,
    logger: { log: (message) => logs.push(message), warn: (message) => logs.push(message) }
  });
  return { activities, blocks, bot, client, inventoryItems, items, logs, service, store, transfers, windows, zone };
}

async function waitForOperation(service) {
  for (let count = 0; count < 50 && service.operation && !service.operation.settled; count += 1) {
    await new Promise((resolve) => { globalThis.setTimeout(resolve, 0); });
  }
  if (service.operation && !service.operation.settled) throw new Error('Storage operation did not finish.');
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

test('reserves, revalidates, and fetches an exact item variant', async () => {
  const { service, store, transfers } = setup();
  service.start('warehouse');
  await waitForScan(service);
  const planned = await service.fetchPlan({ zone: 'warehouse', item: 'stone', count: 32 });
  assert.equal(planned.allocations.length, 1);
  assert.equal(planned.allocations[0].count, 32);
  const started = await service.startFetch({ zone: 'warehouse', item: 'stone', count: 32 });
  assert.equal(started.running, true);
  await waitForOperation(service);
  const status = service.operationStatus();
  assert.equal(status.phase, 'complete');
  assert.equal(status.transferred, 32);
  assert.equal(status.returned, true);
  assert.equal(transfers.length, 1);
  assert.equal(transfers[0].sourceStart, 0);
  assert.deepEqual(store.storageReservationSnapshot().reservations, []);
});

test('refuses changed container stock and releases its reservation', async () => {
  const { bot, service, store } = setup();
  service.start('warehouse');
  await waitForScan(service);
  const originalOpen = bot.openContainer.bind(bot);
  bot.openContainer = async (target) => {
    const window = await originalOpen(target);
    if (target.position.x === 4) window.containerItems()[0].count = 8;
    return window;
  };
  await service.startFetch({ zone: 'warehouse', item: 'stone', count: 32 });
  await waitForOperation(service);
  assert.match(service.operationStatus().failed, /only 8 matching Stone/u);
  assert.equal(service.operationStatus().transferred, 0);
  assert.deepEqual(store.storageReservationSnapshot().reservations, []);
});

test('cancels an active fetch and releases its reservation', async () => {
  const { bot, service, store } = setup();
  service.start('warehouse');
  await waitForScan(service);
  let releaseTransfer;
  bot.transfer = () => new Promise((resolve) => { releaseTransfer = resolve; });
  await service.startFetch({ zone: 'warehouse', item: 'stone', count: 32 });
  for (let count = 0; count < 20; count += 1) {
    if (releaseTransfer) break;
    await new Promise((resolve) => { globalThis.setTimeout(resolve, 0); });
  }
  assert.equal(typeof releaseTransfer, 'function');
  assert.equal(service.stop(), true);
  releaseTransfer();
  await waitForOperation(service);
  assert.equal(service.operationStatus().phase, 'stopping');
  assert.deepEqual(store.storageReservationSnapshot().reservations, []);
});

test('saves category policy without invalidating a current scan', async () => {
  const { service } = setup();
  service.start('warehouse');
  await waitForScan(service);
  const category = await service.saveCategory('warehouse', {
    name: 'Building Blocks',
    items: ['stone'],
    containers: [{ x: 4, y: 64, z: 1 }]
  });
  assert.equal(category.id, 'building-blocks');
  assert.equal(service.categories('warehouse')[0].items[0], 'stone');
  assert.equal(service.inspect('warehouse').scan.stale, false);
  assert.equal(await service.removeCategory('warehouse', category.id), true);
  assert.deepEqual(service.categories('warehouse'), []);
});

test('plans, reserves, revalidates, and deposits an exact inventory variant', async () => {
  const { inventoryItems, items, service, store, transfers } = setup({
    inventoryItems: [{ slot: 9, type: 1, metadata: 0, name: 'stone', displayName: 'Stone', count: 40, stackSize: 64 }]
  });
  service.start('warehouse');
  await waitForScan(service);
  const planned = await service.depositPlan({ zone: 'warehouse', slot: 9, count: 32 });
  assert.equal(planned.allocations.length, 1);
  assert.equal(planned.allocations[0].destinations[0].kind, 'empty');
  const started = await service.startDeposit({ zone: 'warehouse', slot: 9, count: 32 });
  assert.equal(started.kind, 'deposit');
  await waitForOperation(service);
  const status = service.operationStatus();
  assert.equal(status.phase, 'complete');
  assert.equal(status.transferred, 32);
  assert.equal(inventoryItems[0].count, 8);
  assert.equal(items['4,64,1'].find((item) => item.slot === 1).count, 32);
  assert.equal(transfers.at(-1).destStart, 1);
  assert.deepEqual(store.storageReservationSnapshot().reservations, []);
});

test('refuses a changed deposit destination and releases its reservation', async () => {
  const { inventoryItems, items, service, store } = setup({
    inventoryItems: [{ slot: 9, type: 1, metadata: 0, name: 'stone', displayName: 'Stone', count: 32, stackSize: 64 }]
  });
  service.start('warehouse');
  await waitForScan(service);
  items['4,64,1'].push({ slot: 1, type: 3, metadata: 0, name: 'dirt', displayName: 'Dirt', count: 1, stackSize: 64 });
  await service.startDeposit({ zone: 'warehouse', slot: 9, count: 32 });
  await waitForOperation(service);
  assert.match(service.operationStatus().failed, /no longer empty/u);
  assert.equal(inventoryItems[0].count, 32);
  assert.deepEqual(store.storageReservationSnapshot().reservations, []);
});

test('cancels an active deposit and releases its reservation', async () => {
  const { bot, service, store } = setup({
    inventoryItems: [{ slot: 9, type: 1, metadata: 0, name: 'stone', displayName: 'Stone', count: 32, stackSize: 64 }]
  });
  service.start('warehouse');
  await waitForScan(service);
  let releaseTransfer;
  bot.transfer = () => new Promise((resolve) => { releaseTransfer = resolve; });
  await service.startDeposit({ zone: 'warehouse', slot: 9, count: 32 });
  for (let count = 0; count < 20; count += 1) {
    if (releaseTransfer) break;
    await new Promise((resolve) => { globalThis.setTimeout(resolve, 0); });
  }
  assert.equal(typeof releaseTransfer, 'function');
  assert.equal(service.stop(), true);
  releaseTransfer();
  await waitForOperation(service);
  assert.equal(service.operationStatus().phase, 'stopping');
  assert.deepEqual(store.storageReservationSnapshot().reservations, []);
});
