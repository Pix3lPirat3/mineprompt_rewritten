'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MAX_STORAGE_VOLUME,
  cleanStorageZones,
  createStorageZone,
  normalizeBounds,
  storageVariant,
  zoneMatchesContext
} = require('../src/main/storage-model');

test('normalizes bounded storage regions', () => {
  assert.deepEqual(normalizeBounds({ x: 4.9, y: 70, z: 8 }, { x: 1, y: 68.9, z: 3 }), {
    from: { x: 1, y: 68, z: 3 },
    to: { x: 4, y: 70, z: 8 },
    size: { x: 4, y: 3, z: 6 },
    volume: 72
  });
  assert.throws(() => normalizeBounds({ x: 0, y: 0, z: 0 }, { x: MAX_STORAGE_VOLUME, y: 0, z: 0 }), /cannot exceed/u);
});

test('creates scoped storage zones with stable human-readable ids', () => {
  const first = createStorageZone({
    name: 'Main Storage',
    server: { host: 'Example.Test', port: 25565 },
    dimension: 'minecraft:overworld',
    from: { x: 0, y: 64, z: 0 },
    to: { x: 4, y: 70, z: 4 }
  }, [], 100);
  const second = createStorageZone({ ...first, id: '', name: 'Main Storage', createdAt: undefined }, [first], 200);
  assert.equal(first.id, 'main-storage');
  assert.equal(second.id, 'main-storage-2');
  assert.equal(first.server.host, 'example.test');
  assert.equal(zoneMatchesContext(first, { server: { host: 'EXAMPLE.TEST', port: 25565 }, dimension: 'minecraft:overworld' }), true);
  assert.equal(zoneMatchesContext(first, { server: { host: 'example.test', port: 25566 }, dimension: 'minecraft:overworld' }), false);
});

test('drops invalid and duplicate persisted storage zones', () => {
  const input = {
    id: 'main',
    name: 'Main',
    server: { host: 'example.test', port: 25565 },
    dimension: 'minecraft:overworld',
    from: { x: 0, y: 64, z: 0 },
    to: { x: 4, y: 70, z: 4 },
    createdAt: 100,
    updatedAt: 200
  };
  assert.deepEqual(cleanStorageZones([input, { ...input, id: 'duplicate' }, { broken: true }]), [{ ...input, categories: [] }]);
});

test('normalizes exclusive category selectors and container assignments', () => {
  const zone = createStorageZone({
    id: 'main',
    name: 'Main',
    server: { host: 'example.test', port: 25565 },
    dimension: 'overworld',
    from: { x: 0, y: 64, z: 0 },
    to: { x: 4, y: 64, z: 4 },
    categories: [{ name: 'Building Blocks', items: ['Stone', 'stone'], containers: [{ x: 2, y: 64, z: 2 }] }]
  });
  assert.deepEqual(zone.categories, [{ id: 'building-blocks', name: 'Building Blocks', items: ['stone'], containers: [{ x: 2, y: 64, z: 2 }], overflow: false }]);
  assert.throws(() => createStorageZone({ ...zone, categories: [
    { name: 'First', items: ['stone'], containers: [{ x: 1, y: 64, z: 1 }] },
    { name: 'Second', items: ['stone'], containers: [{ x: 2, y: 64, z: 2 }] }
  ] }), /belongs to more than one category/u);
  assert.throws(() => createStorageZone({ ...zone, categories: [{ name: 'Outside', containers: [{ x: 9, y: 64, z: 9 }] }] }), /outside the storage zone/u);
});

test('hashes exact item variants without exposing identity payloads', () => {
  const plain = storageVariant({ type: 1, metadata: 0, nbt: null });
  const named = storageVariant({ type: 1, metadata: 0, nbt: { value: { name: 'Named' } } });
  assert.equal(plain.id.length, 24);
  assert.notEqual(plain.id, named.id);
  assert.notEqual(plain.identity, named.identity);
});
