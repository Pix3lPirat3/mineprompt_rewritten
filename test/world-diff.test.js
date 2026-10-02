'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Vec3 } = require('vec3');
const { diffBlueprint, entrySupportedByRegistry } = require('../src/main/world-diff');

function worldBlock(name, x, stateId, options = {}) {
  return {
    name,
    type: options.type ?? stateId,
    metadata: options.metadata ?? 0,
    stateId,
    diggable: options.diggable !== false,
    position: new Vec3(x, 64, 0),
    getProperties: () => options.properties || {}
  };
}

function entry(state, stateId, options = {}) {
  const name = state.replace(/^minecraft:/u, '').split('[')[0];
  return {
    state,
    namespace: options.namespace || 'minecraft',
    name,
    displayName: name,
    stateId,
    item: options.item === undefined ? name : options.item,
    itemDisplayName: name,
    air: options.air === true,
    supported: options.supported !== false,
    needsSupport: false
  };
}

function blueprint() {
  return {
    id: 'preview',
    hash: 'a'.repeat(64),
    name: 'Preview',
    edition: 'java',
    version: '1.21.11',
    dimensions: { x: 7, y: 1, z: 1 },
    offset: { x: 0, y: 0, z: 0 },
    palette: [
      entry('minecraft:stone', 1),
      entry('minecraft:oak_planks', 2),
      entry('minecraft:air', 0, { air: true, item: null }),
      entry('custom:machine', null, { namespace: 'custom', supported: false, item: null })
    ],
    blocks: [0, 1, 1, 1, 1, 2, 3],
    blockEntities: []
  };
}

test('classifies a bounded world diff without changing the world', async () => {
  const blocks = new Map([
    ['0,64,0', worldBlock('stone', 0, 1)],
    ['1,64,0', worldBlock('air', 1, 0)],
    ['2,64,0', worldBlock('dirt', 2, 3)],
    ['3,64,0', worldBlock('water', 3, 4)],
    ['4,64,0', worldBlock('air', 4, 0)],
    ['5,64,0', worldBlock('dirt', 5, 3)],
    ['6,64,0', worldBlock('air', 6, 0)]
  ]);
  const bot = {
    version: '1.21.11',
    entity: { id: 1, position: new Vec3(0, 64, 0) },
    entities: { 9: { id: 9, isValid: true, position: new Vec3(4, 64, 0) } },
    inventory: { items: () => [{ name: 'oak_planks', count: 1 }] },
    blockAt: (position) => blocks.get(`${position.x},${position.y},${position.z}`) || null
  };
  const result = await diffBlueprint(bot, blueprint(), { anchor: { x: 0, y: 64, z: 0 } });
  assert.deepEqual(result.counts, {
    correct: 1,
    ignoredAir: 1,
    placeable: 1,
    replaceable: 1,
    conflicting: 1,
    temporarilyObstructed: 1,
    unknown: 0,
    unsupported: 1
  });
  assert.deepEqual(result.requirements, [{ name: 'oak_planks', count: 3, available: 1, missing: 2 }]);
  assert.deepEqual(result.removals, [{ name: 'water', count: 1 }]);
  assert.deepEqual(result.warnings, []);
});

test('reports version mismatch without translating palette states', async () => {
  const bot = {
    version: '1.20.4',
    entity: { id: 1, position: new Vec3(0, 64, 0) },
    entities: {},
    inventory: { items: () => [] },
    blockAt: (position) => worldBlock('air', position.x, 0)
  };
  const result = await diffBlueprint(bot, blueprint(), { anchor: { x: 0, y: 64, z: 0 }, rotation: 90 });
  assert.match(result.warnings[0], /No conversion was applied/u);
  assert.equal(result.transform.rotation, 90);
  assert.equal(result.dimensions.z, 7);
});

test('uses the connected bot registry for placement support', () => {
  const bot = { registry: { blocksByName: { stone: {} }, itemsByName: { stone: {} } } };
  assert.equal(entrySupportedByRegistry(bot, entry('minecraft:stone', 1)), true);
  assert.equal(entrySupportedByRegistry(bot, entry('minecraft:oak_planks', 2)), false);
});
