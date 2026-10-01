'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Vec3 } = require('vec3');
const { blockHazard, distance, normalizeRegion, planReachRoute, regionPositions } = require('../src/main/mining-planner');

function key(point) {
  return `${point.x},${point.y},${point.z}`;
}

test('normalizes a cuboid and produces a stable top-down serpentine traversal', () => {
  const region = normalizeRegion({ x: 2, y: 4, z: 2 }, { x: 0, y: 3, z: 0 });
  const positions = regionPositions(region);
  assert.equal(region.size, 18);
  assert.equal(positions[0].y, 4);
  assert.equal(positions.at(-1).y, 3);
  assert.equal(new Set(positions.map(key)).size, 18);
  assert.throws(() => normalizeRegion({ x: 0, y: 0, z: 0 }, { x: 20, y: 20, z: 20 }, 4096), /configured limit/u);
});

test('batches a long region by reach and avoids movement for every block', () => {
  const targets = Array.from({ length: 24 }, (_, x) => ({ x, y: 64, z: 0 }));
  const stands = Array.from({ length: 12 }, (_, index) => ({ x: index * 2, y: 64, z: 3 }));
  const plan = planReachRoute(targets, stands, { x: 0, y: 64, z: 3 }, 4.8);
  assert.equal(plan.covered, targets.length);
  assert.equal(plan.unresolved.length, 0);
  assert.ok(plan.route.length <= 6);
  assert.ok(plan.travelDistance < targets.length);
});

test('maintains coverage and reach invariants across deterministic generated worlds', () => {
  let seed = 0x51f15e;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  for (let scenario = 0; scenario < 250; scenario += 1) {
    const targets = Array.from({ length: 8 + Math.floor(random() * 30) }, () => ({ x: Math.floor(random() * 16), y: 60 + Math.floor(random() * 4), z: Math.floor(random() * 16) }));
    const uniqueTargets = [...new Map(targets.map((target) => [key(target), target])).values()];
    const stands = uniqueTargets.map((target) => ({ x: target.x, y: target.y, z: target.z + 2 }));
    const plan = planReachRoute(uniqueTargets, stands, stands[0], 4.8);
    const visited = plan.route.flatMap((step) => step.blocks);
    assert.equal(plan.covered, uniqueTargets.length);
    assert.equal(new Set(visited.map(key)).size, uniqueTargets.length);
    for (const step of plan.route) {
      const eye = { x: step.stand.x + 0.5, y: step.stand.y + 1.62, z: step.stand.z + 0.5 };
      for (const block of step.blocks) assert.ok(distance(eye, { x: block.x + 0.5, y: block.y + 0.5, z: block.z + 0.5 }) <= 4.8);
    }
  }
});

test('rejects fluid exposure and falling-block hazards by default', () => {
  const target = { name: 'stone', displayName: 'Stone', diggable: true, position: new Vec3(0, 64, 0) };
  const blocks = new Map([
    ['1,64,0', { name: 'water' }],
    ['0,65,0', { name: 'gravel' }]
  ]);
  const bot = { blockAt: (position) => blocks.get(key(position)) || { name: 'stone' } };
  assert.equal(blockHazard(bot, target, { allowFluidAdjacent: false, allowFalling: true }), 'fluid-edge');
  assert.equal(blockHazard(bot, target, { allowFluidAdjacent: true, allowFalling: false }), 'falling-block');
  assert.equal(blockHazard(bot, target, { allowFluidAdjacent: true, allowFalling: true }), null);
});
