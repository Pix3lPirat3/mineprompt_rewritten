'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Vec3 } = require('vec3');
const { candidateStances, compilePlacementGraph, compileStancePlan, supportRule, topologicalOrder } = require('../src/main/placement-compiler');

function entry(state, options = {}) {
  const name = state.replace(/^minecraft:/u, '').split('[')[0];
  return { state, name, namespace: 'minecraft', item: name, air: false, ...options };
}

function record(kind, x, y, state, options = {}) {
  return {
    index: options.index || 0,
    paletteIndex: options.paletteIndex || 0,
    kind,
    local: { x, y: y - 64, z: 0 },
    position: { x, y, z: 0 },
    expected: state,
    current: options.current || 'minecraft:air',
    blockName: options.blockName || 'air',
    entry: entry(state, options.entry)
  };
}

function flatBot(overrides = new Map()) {
  return {
    entity: { position: new Vec3(0, 64, -3) },
    blockAt(position) {
      const key = `${position.x},${position.y},${position.z}`;
      const name = overrides.get(key) || (position.y <= 63 ? 'stone' : 'air');
      return { name, position: new Vec3(position.x, position.y, position.z) };
    }
  };
}

test('compiles removal, support, gravity, and multi-block dependencies', () => {
  const analysis = { records: [
    record('placeable', 0, 64, 'minecraft:stone'),
    record('placeable', 0, 65, 'minecraft:sand'),
    record('placeable', 0, 66, 'minecraft:torch'),
    record('replaceable', 1, 64, 'minecraft:oak_door[facing=north,half=lower,hinge=left,open=false,powered=false]', { current: 'minecraft:dirt', blockName: 'dirt' }),
    record('placeable', 1, 65, 'minecraft:oak_door[facing=north,half=upper,hinge=left,open=false,powered=false]'),
    record('replaceable', 2, 64, 'minecraft:air', { current: 'minecraft:dirt', blockName: 'dirt', entry: { air: true, item: null } }),
    record('placeable', 3, 64, 'minecraft:oak_wall_sign[facing=west]'),
    record('placeable', 4, 64, 'minecraft:stone')
  ] };
  const graph = compilePlacementGraph(flatBot(), analysis);
  const byId = new Map(graph.operations.map((operation) => [operation.id, operation]));
  assert.deepEqual(byId.get('place:0,65,0').dependencies, ['place:0,64,0']);
  assert.deepEqual(byId.get('place:0,66,0').dependencies, ['place:0,65,0']);
  assert.deepEqual(byId.get('place:1,64,0').dependencies, ['remove:1,64,0']);
  assert.equal(byId.get('place:1,65,0').dependencies.includes('place:1,64,0'), true);
  assert.deepEqual(byId.get('place:3,64,0').dependencies, ['place:4,64,0']);
  assert.deepEqual(byId.get('place:3,64,0').instruction.clickedFace, { x: -1, y: 0, z: 0 });
  assert.equal(byId.get('place:3,64,0').instruction.cursor.x, 0);
  assert.equal(byId.get('place:3,64,0').instruction.mode, 'attached');
  assert.equal(byId.has('place:2,64,0'), false);
  assert.equal(graph.counts.removals, 2);
  assert.equal(graph.counts.placements, 7);
  assert.equal(graph.counts.groups, 1);
  assert.deepEqual(graph.cyclic, []);
  assert.equal(graph.order.indexOf('place:0,64,0') < graph.order.indexOf('place:0,65,0'), true);
});

test('reports required support and deterministic dependency cycles', () => {
  assert.deepEqual(supportRule(entry('minecraft:oak_wall_sign[facing=east]')).offsets, [{ x: -1, y: 0, z: 0 }]);
  const operations = [
    { id: 'a', kind: 'place', position: { x: 0, y: 0, z: 0 }, dependencies: ['b'] },
    { id: 'b', kind: 'place', position: { x: 1, y: 0, z: 0 }, dependencies: ['a'] }
  ];
  assert.deepEqual(topologicalOrder(operations), { ordered: [], cyclic: ['a', 'b'] });
});

test('selects safe stances that cover multiple reachable operations', () => {
  const operations = [0, 1, 2].map((x) => ({
    id: `place:${x},64,0`,
    kind: 'place',
    position: { x, y: 64, z: 0 },
    expected: 'minecraft:stone',
    dependencies: [],
    blocked: []
  }));
  const graph = { operations, order: operations.map((operation) => operation.id) };
  const bot = flatBot();
  const plan = compileStancePlan(bot, graph);
  assert.equal(plan.uncovered.length, 0);
  assert.equal(plan.counts.covered, 3);
  assert.equal(plan.stances.length <= 2, true);
  assert.equal(plan.stances.some((stance) => stance.operations.length >= 2), true);
  assert.equal(candidateStances(bot, operations[0]).every((stance) => stance.position.y === 64), true);
});

test('rejects hazardous footing and blocked sight lines', () => {
  const hazards = new Map([
    ['0,63,-1', 'lava'],
    ['0,65,-1', 'stone']
  ]);
  const operation = { id: 'place:0,64,0', kind: 'place', position: { x: 0, y: 64, z: 0 }, expected: 'minecraft:stone', dependencies: [], blocked: [] };
  const stances = candidateStances(flatBot(hazards), operation);
  assert.equal(stances.some((stance) => stance.position.x === 0 && stance.position.z === -1), false);
});

test('maintains dependency order across generated support topologies', () => {
  let seed = 90210;
  const random = () => {
    seed = seed * 1664525 + 1013904223 >>> 0;
    return seed / 4294967296;
  };
  for (let fixture = 0; fixture < 40; fixture += 1) {
    const records = [];
    let index = 0;
    for (let x = 0; x < 6; x += 1) {
      const height = 1 + Math.floor(random() * 6);
      for (let level = 0; level < height; level += 1) {
        const state = level === height - 1 && random() < 0.35 ? 'minecraft:sand' : 'minecraft:stone';
        records.push(record('placeable', x, 64 + level, state, { index: index++ }));
      }
    }
    const graph = compilePlacementGraph(flatBot(), { records });
    const order = new Map(graph.order.map((id, position) => [id, position]));
    assert.equal(graph.cyclic.length, 0);
    assert.equal(graph.order.length, graph.operations.length);
    for (const operation of graph.operations) {
      for (const dependency of operation.dependencies) assert.equal(order.get(dependency) < order.get(operation.id), true);
    }
  }
});

test('compiles recoverable scaffold columns for floating full blocks', () => {
  const analysis = {
    policy: { scaffolding: ['dirt'] },
    records: [record('placeable', 0, 68, 'minecraft:stone')]
  };
  const graph = compilePlacementGraph(flatBot(), analysis);
  const byId = new Map(graph.operations.map((operation) => [operation.id, operation]));
  assert.equal(graph.counts.scaffoldBlocks, 4);
  assert.equal(graph.counts.operations, 9);
  assert.deepEqual(byId.get('place:0,68,0').dependencies, ['scaffold-place:0,67,0']);
  assert.equal(byId.get('scaffold-remove:0,67,0').dependencies.includes('place:0,68,0'), true);
  assert.equal(byId.get('scaffold-remove:0,66,0').dependencies.includes('scaffold-remove:0,67,0'), true);
  const order = new Map(graph.order.map((id, index) => [id, index]));
  assert.equal(order.get('scaffold-place:0,67,0') < order.get('place:0,68,0'), true);
  assert.equal(order.get('place:0,68,0') < order.get('scaffold-remove:0,67,0'), true);
});

test('does not use removable scaffolding as permanent attachment support', () => {
  const graph = compilePlacementGraph(flatBot(), {
    policy: { scaffolding: ['dirt'] },
    records: [record('placeable', 0, 68, 'minecraft:oak_wall_sign[facing=north]')]
  });
  assert.equal(graph.counts.scaffoldBlocks, 0);
  assert.equal(graph.operations[0].blocked.some((reason) => reason.code === 'missing-support'), true);
});

test('groups paired containers and gates unsupported state restoration', () => {
  const records = [
    record('placeable', 0, 64, 'minecraft:chest[facing=north,type=left,waterlogged=false]'),
    record('placeable', 1, 64, 'minecraft:chest[facing=north,type=right,waterlogged=false]'),
    record('placeable', 2, 64, 'minecraft:oak_slab[half=bottom,type=bottom,waterlogged=true]'),
    record('placeable', 3, 64, 'minecraft:oak_sign[rotation=4,waterlogged=false]')
  ];
  const graph = compilePlacementGraph(flatBot(), {
    anchor: { x: 0, y: 64, z: 0 },
    transformed: { offset: { x: 0, y: 0, z: 0 }, blockEntities: [{ Pos: [3, 0, 0] }] },
    policy: { scaffolding: ['dirt'] },
    records
  });
  const byId = new Map(graph.operations.map((operation) => [operation.id, operation]));
  assert.equal(byId.get('place:0,64,0').groupId, byId.get('place:1,64,0').groupId);
  assert.equal(byId.get('place:1,64,0').dependencies.includes('place:0,64,0'), true);
  assert.equal(byId.get('place:2,64,0').blocked.some((reason) => reason.code === 'waterlogged-unsupported'), true);
  assert.equal(byId.get('place:3,64,0').blocked.some((reason) => reason.code === 'block-entity-unsupported'), true);
  assert.equal(byId.get('place:3,64,0').instruction.rotation, 4);
});
