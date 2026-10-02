'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  blockStateString,
  blueprintHash,
  normalizeDimensions,
  parseBlockState,
  transformBlockState,
  transformBlueprint,
  transformPosition
} = require('../src/main/blueprint-model');

test('normalizes exact block state strings deterministically', () => {
  assert.deepEqual(parseBlockState('minecraft:oak_stairs[waterlogged=false,facing=north,half=bottom]'), {
    namespace: 'minecraft',
    name: 'oak_stairs',
    properties: { waterlogged: 'false', facing: 'north', half: 'bottom' }
  });
  assert.equal(blockStateString('oak_stairs[waterlogged=false,facing=north,half=bottom]'), 'minecraft:oak_stairs[facing=north,half=bottom,waterlogged=false]');
  assert.throws(() => parseBlockState('stone[broken]'), /Invalid block state property/u);
  assert.throws(() => normalizeDimensions({ x: 513, y: 1, z: 1 }), /1 to 512/u);
});

test('rotates and mirrors coordinates and directional block properties', () => {
  assert.deepEqual(transformPosition({ x: 0, y: 2, z: 1 }, { x: 3, y: 4, z: 5 }, { rotation: 90, mirror: 'none' }), { x: 3, y: 2, z: 0 });
  assert.equal(
    transformBlockState('minecraft:oak_stairs[facing=north,half=bottom,shape=inner_left]', { rotation: 90, mirror: 'x' }),
    'minecraft:oak_stairs[facing=east,half=bottom,shape=inner_right]'
  );
  assert.equal(
    transformBlockState('minecraft:oak_fence[east=true,north=false,south=true,west=false]', { rotation: 90 }),
    'minecraft:oak_fence[east=false,north=false,south=true,west=true]'
  );
  assert.equal(transformBlockState('minecraft:oak_log[axis=x]', { rotation: 90 }), 'minecraft:oak_log[axis=z]');
  assert.equal(transformBlockState('minecraft:jigsaw[orientation=north_up]', { rotation: 90 }), 'minecraft:jigsaw[orientation=east_up]');
});

test('transforms blueprint dimensions without losing or duplicating blocks', () => {
  const blueprint = {
    dimensions: { x: 2, y: 1, z: 3 },
    offset: { x: -1, y: 0, z: 2 },
    palette: [{ state: 'minecraft:air' }, { state: 'minecraft:furnace[facing=north]' }],
    blocks: [1, 0, 0, 1, 1, 0]
  };
  const transformed = transformBlueprint(blueprint, { rotation: 90, mirror: 'z' });
  assert.deepEqual(transformed.dimensions, { x: 3, y: 1, z: 2 });
  assert.deepEqual([...transformed.blocks].sort(), [0, 0, 0, 1, 1, 1]);
  assert.equal(transformed.palette[1].state, 'minecraft:furnace[facing=west]');
  assert.deepEqual(transformed.offset, { x: 2, y: 0, z: -1 });
});

test('rejects unsafe legacy metadata transforms instead of changing their meaning', () => {
  assert.throws(() => transformBlueprint({
    sourceFormat: 'mcedit',
    dimensions: { x: 1, y: 1, z: 1 },
    offset: { x: 0, y: 0, z: 0 },
    palette: [{ state: 'minecraft:oak_stairs[legacy_metadata=2]', stateId: null }],
    blocks: [0]
  }, { rotation: 90 }), /cannot be transformed safely/u);
});

test('keeps the declared origin fixed while transforming block entities', () => {
  const blueprint = {
    sourceFormat: 'sponge-v3',
    dimensions: { x: 2, y: 1, z: 3 },
    offset: { x: 0, y: 0, z: 0 },
    palette: [{ state: 'minecraft:chest[facing=north]', stateId: 1 }],
    blocks: [0, 0, 0, 0, 0, 0],
    blockEntities: [{ Id: 'minecraft:chest', Pos: [0, 0, 0] }]
  };
  const transformed = transformBlueprint(blueprint, { rotation: 90 });
  assert.deepEqual(transformed.offset, { x: -2, y: 0, z: 0 });
  assert.deepEqual(transformed.blockEntities[0].Pos, [2, 0, 0]);
  assert.deepEqual({
    x: transformed.offset.x + transformed.blockEntities[0].Pos[0],
    y: transformed.offset.y + transformed.blockEntities[0].Pos[1],
    z: transformed.offset.z + transformed.blockEntities[0].Pos[2]
  }, { x: 0, y: 0, z: 0 });
});

test('hashes equivalent block entity compounds independently of key order', () => {
  const base = {
    edition: 'java',
    version: '1.21.11',
    dimensions: { x: 1, y: 1, z: 1 },
    offset: { x: 0, y: 0, z: 0 },
    palette: [{ state: 'minecraft:chest[facing=north]' }],
    blocks: [0]
  };
  assert.equal(
    blueprintHash({ ...base, blockEntities: [{ Pos: [0, 0, 0], Items: [{ Slot: 0, id: 'minecraft:stone' }], Id: 'minecraft:chest' }] }),
    blueprintHash({ ...base, blockEntities: [{ Id: 'minecraft:chest', Items: [{ id: 'minecraft:stone', Slot: 0 }], Pos: [0, 0, 0] }] })
  );
});
