'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { candidateTreeStances, discoverTree, planForestRoute, planTreeRoute } = require('../src/main/tree-planner');

function positionKey(position) {
  return `${position.x},${position.y},${position.z}`;
}

function world(blocks) {
  const values = new Map();
  for (const [name, positions, properties = {}] of blocks) {
    for (const position of positions) values.set(positionKey(position), { name, displayName: name, position: { ...position }, boundingBox: name.includes('air') ? 'empty' : 'block', properties });
  }
  return (position) => values.get(positionKey(position)) || { name: 'air', position: { ...position }, boundingBox: 'empty' };
}

function flatGround(minimum = -8, maximum = 8, y = 63) {
  const positions = [];
  for (let x = minimum; x <= maximum; x += 1) for (let z = minimum; z <= maximum; z += 1) positions.push({ x, y, z });
  return positions;
}

function column(x, from, to, z = 0) {
  return Array.from({ length: to - from + 1 }, (_, index) => ({ x, y: from + index, z }));
}

test('discovers a connected natural tree from its trunk or leaves', () => {
  const logs = column(0, 64, 69);
  const leaves = [];
  for (let x = -2; x <= 2; x += 1) for (let z = -2; z <= 2; z += 1) leaves.push({ x, y: 69, z });
  const read = world([
    ['dirt', flatGround()],
    ['oak_leaves', leaves],
    ['oak_log', logs]
  ]);
  const trunkTree = discoverTree(read, { x: 0, y: 64, z: 0 });
  const leafTree = discoverTree(read, { x: 2, y: 69, z: 0 });
  assert.equal(trunkTree.species, 'oak');
  assert.equal(trunkTree.logs.length, 6);
  assert.equal(trunkTree.height, 6);
  assert.equal(trunkTree.natural, true);
  assert.deepEqual(leafTree.logs, trunkTree.logs);
});

test('preserves a stump until it has been used to reach a tall trunk', () => {
  const logs = column(0, 64, 70);
  const leaves = [];
  for (let x = -2; x <= 2; x += 1) for (let z = -2; z <= 2; z += 1) leaves.push({ x, y: 70, z });
  const read = world([
    ['dirt', flatGround()],
    ['spruce_leaves', leaves],
    ['spruce_log', logs]
  ]);
  const tree = discoverTree(read, logs[0]);
  const stands = candidateTreeStances(read, tree, { x: 1, y: 64, z: 0 }, { reach: 4.8, leafSupport: 'never', logSupport: true });
  const plan = planTreeRoute(tree, stands, { x: 1, y: 64, z: 0 });
  assert.equal(plan.covered, logs.length);
  assert.equal(plan.unresolved.length, 0);
  const stump = positionKey(logs[0]);
  const stumpIndex = plan.steps.findIndex((step) => step.blocks.some((block) => positionKey(block) === stump));
  const elevatedIndex = plan.steps.findIndex((step) => step.kind === 'log');
  assert.ok(elevatedIndex >= 0);
  assert.ok(stumpIndex > elevatedIndex);
  assert.equal(new Set(plan.steps.flatMap((step) => step.blocks.map(positionKey))).size, logs.length);
});

test('plans deterministic generated trunks without duplicate or missing logs', () => {
  let seed = 0xa11ce;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  for (let scenario = 0; scenario < 150; scenario += 1) {
    const height = 4 + Math.floor(random() * 4);
    const logs = column(0, 64, 63 + height);
    if (random() > 0.45) logs.push({ x: 1, y: 62 + height, z: 0 }, { x: -1, y: 63 + height, z: 0 });
    const leaves = [];
    for (let x = -2; x <= 2; x += 1) for (let z = -2; z <= 2; z += 1) leaves.push({ x, y: 63 + height, z });
    const read = world([['dirt', flatGround()], ['birch_leaves', leaves], ['birch_log', logs]]);
    const tree = discoverTree(read, logs[0]);
    const stands = candidateTreeStances(read, tree, { x: 2, y: 64, z: 0 }, { leafSupport: 'never' });
    const plan = planTreeRoute(tree, stands, { x: 2, y: 64, z: 0 });
    const planned = plan.steps.flatMap((step) => step.blocks.map(positionKey));
    assert.equal(plan.unresolved.length, 0, `scenario ${scenario}`);
    assert.equal(new Set(planned).size, tree.logs.length, `scenario ${scenario}`);
  }
});

test('routes a forest by expected yield and travel cost', () => {
  const trees = [
    { origin: { x: 3, y: 64, z: 0 }, logs: column(3, 64, 67) },
    { origin: { x: 10, y: 64, z: 0 }, logs: column(10, 64, 73) },
    { origin: { x: -20, y: 64, z: 0 }, logs: column(-20, 64, 68) }
  ];
  const plan = planForestRoute(trees, { x: 0, y: 64, z: 0 });
  assert.equal(plan.route[0], trees[0]);
  assert.equal(plan.route.at(-1), trees[2]);
  assert.ok(plan.travelDistance > 0);
});
