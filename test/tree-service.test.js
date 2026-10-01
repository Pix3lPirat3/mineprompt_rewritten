'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Vec3 } = require('vec3');
const { ActivityManager } = require('../src/main/activity-manager');
const { discoverTree } = require('../src/main/tree-planner');
const { normalizeTreePolicy } = require('../src/main/tree-policy');
const { TreeService, allowLeafAccess, cardinalBridgeTarget, estimateTreePath, localCardinalStep, movementKey, nearbyHopTarget } = require('../src/main/tree-service');

function value(position) {
  return `${position.x},${position.y},${position.z}`;
}

function fixture(height = 7) {
  const blocks = new Map();
  const navigated = [];
  const put = (name, x, y, z, properties = {}) => blocks.set(`${x},${y},${z}`, {
    name,
    displayName: name,
    position: new Vec3(x, y, z),
    boundingBox: name === 'air' ? 'empty' : 'block',
    properties
  });
  for (let x = -6; x <= 6; x += 1) for (let z = -6; z <= 6; z += 1) put('dirt', x, 63, z);
  for (let y = 64; y < 64 + height; y += 1) put('oak_log', 0, y, 0);
  for (let x = -2; x <= 2; x += 1) for (let z = -2; z <= 2; z += 1) {
    if (x || z) put('oak_leaves', x, 63 + height, z);
  }
  const bot = {
    entity: { position: new Vec3(1.5, 64, 0.5), eyeHeight: 1.62 },
    blockAt: (position) => blocks.get(value(position)) || { name: 'air', position: new Vec3(position.x, position.y, position.z), boundingBox: 'empty' },
    blockAtCursor: () => blocks.get('0,64,0'),
    canSeeBlock: () => true,
    pathfinder: {
      goto: async (goal) => {
        bot.entity.position = new Vec3(goal.x + 0.5, goal.y, goal.z + 0.5);
        navigated.push(value(bot.entity.position));
      },
      setGoal: () => {}
    },
    clearControlStates: () => {}
  };
  const mined = [];
  const mining = {
    mineOnce: async (block) => {
      mined.push(value(block.position));
      blocks.delete(value(block.position));
      return { mined: true, skipped: false };
    }
  };
  const logs = [];
  const logger = { log: () => {}, warn: () => {} };
  const service = new TreeService({ getClient: () => ({ bot }), activities: new ActivityManager(), mining, logger });
  return { blocks, bot, logs, mined, navigated, service };
}

test('inspects a tree with a complete support-aware route', () => {
  const { service } = fixture();
  const result = service.inspect({ target: 'cursor', policy: { leafSupport: 'never' } });
  assert.equal(result.tree.species, 'oak');
  assert.equal(result.tree.logs.length, 7);
  assert.equal(result.plan.unresolved.length, 0);
  assert.match(result.message, /Planned: 7\/7 logs/u);
});

test('replans between safe stance batches and removes the stump after using it', async () => {
  const { bot, mined, navigated, service } = fixture();
  const policy = normalizeTreePolicy({ leafSupport: 'never' });
  const tree = discoverTree(service.reader(bot), { x: 0, y: 64, z: 0 });
  const state = { running: true, treesFinished: 0, treesFound: 1, logsMined: 0, logsSkipped: 0, phase: 'felling' };
  await service.fell(tree, policy, state);
  assert.equal(state.logsMined, 7);
  assert.equal(new Set(mined).size, 7);
  assert.equal(mined.at(-1), '0,64,0');
  assert.ok(navigated.some((position) => position.split(',')[1] === '65'));
});

test('rejects an unreachable stance with a bounded Pathfinder estimate', () => {
  const bot = {
    entity: { position: new Vec3(0, 64, 0) },
    pathfinder: {
      movements: {},
      getPathFromTo: function * getPathFromTo() {
        yield { result: { status: 'noPath', cost: 0, path: [] } };
      }
    }
  };
  const result = estimateTreePath(bot, { x: 4, y: 65, z: 2 });
  assert.equal(result.available, true);
  assert.equal(result.reachable, false);
  assert.equal(result.status, 'noPath');
});

test('allows only non-support leaves to be cleared for an explicit canopy route', () => {
  const movements = { canDig: false, exclusionAreasBreak: [] };
  const bot = { pathfinder: { movements } };
  const restore = allowLeafAccess(bot, { kind: 'leaf', stand: { x: 3, y: 70, z: 4 } }, { leafSupport: 'always' });
  assert.equal(movements.canDig, true);
  const exclusion = movements.exclusionAreasBreak[0];
  assert.equal(exclusion({ name: 'oak_leaves', position: { x: 2, y: 69, z: 4 } }), 0);
  assert.equal(exclusion({ name: 'oak_leaves', position: { x: 3, y: 69, z: 4 } }), 100);
  assert.equal(exclusion({ name: 'oak_log', position: { x: 2, y: 69, z: 4 } }), 100);
  restore();
  assert.equal(movements.canDig, false);
  assert.deepEqual(movements.exclusionAreasBreak, []);
});

test('recognizes a clear adjacent support step as a controlled hop', () => {
  const blocks = new Map([
    ['1,64,0', { name: 'oak_leaves', position: new Vec3(1, 64, 0), boundingBox: 'block' }]
  ]);
  const bot = {
    entity: { position: new Vec3(0.5, 64, 0.5) },
    blockAt: (position) => blocks.get(value(position)) || { name: 'air', position, boundingBox: 'empty' }
  };
  const target = nearbyHopTarget(bot, { next: { x: 1, y: 65, z: 0 } }, { leafSupport: 'always', logSupport: 'stump' });
  assert.deepEqual(target, { x: 1, y: 65, z: 0 });
  assert.equal(nearbyHopTarget(bot, { next: { x: 1, y: 65, z: 0 } }, { leafSupport: 'safe', logSupport: 'stump' }), null);
  blocks.set('1,65,0', { name: 'oak_log', position: new Vec3(1, 65, 0), boundingBox: 'block' });
  assert.equal(nearbyHopTarget(bot, { next: { x: 1, y: 65, z: 0 } }, { leafSupport: 'always', logSupport: 'stump' }), null);
});

test('uses a cardinal bridge instead of a diagonal ascent', () => {
  const blocks = new Map([
    ['1,63,0', { name: 'grass_block', position: new Vec3(1, 63, 0), boundingBox: 'block' }],
    ['1,64,1', { name: 'grass_block', position: new Vec3(1, 64, 1), boundingBox: 'block' }]
  ]);
  const bot = {
    entity: { position: new Vec3(0.5, 64, 0.5) },
    blockAt: (position) => blocks.get(value(position)) || { name: 'air', position, boundingBox: 'empty' }
  };
  const policy = { leafSupport: 'always', logSupport: 'stump' };
  assert.deepEqual(cardinalBridgeTarget(bot, { next: { x: 1, y: 65, z: 1 } }, policy), { x: 1, y: 64, z: 0 });
  assert.equal(nearbyHopTarget(bot, { next: { x: 1, y: 65, z: 1 } }, policy), null);
});

test('bridges over a blocked terrain corner', () => {
  const blocks = new Map([
    ['1,64,0', { name: 'grass_block', position: new Vec3(1, 64, 0), boundingBox: 'block' }],
    ['1,63,1', { name: 'grass_block', position: new Vec3(1, 63, 1), boundingBox: 'block' }]
  ]);
  const bot = {
    entity: { position: new Vec3(0.5, 64, 0.5) },
    blockAt: (position) => blocks.get(value(position)) || { name: 'air', position, boundingBox: 'empty' }
  };
  const policy = { leafSupport: 'always', logSupport: 'stump' };
  assert.deepEqual(cardinalBridgeTarget(bot, { next: { x: 1, y: 64, z: 1 } }, policy), { x: 1, y: 65, z: 0 });
});

test('finds a bounded cardinal detour around unsupported corners', () => {
  const blocks = new Map();
  const route = [[-1, 0], [-1, 1], [-1, 2], [0, 2], [1, 2], [1, 1]];
  for (const [x, z] of route) blocks.set(`${x},63,${z}`, { name: 'grass_block', position: new Vec3(x, 63, z), boundingBox: 'block' });
  const bot = {
    entity: { position: new Vec3(0.5, 64, 0.5) },
    blockAt: (position) => blocks.get(value(position)) || { name: 'air', position, boundingBox: 'empty' }
  };
  const policy = { leafSupport: 'always', logSupport: 'stump' };
  assert.deepEqual(localCardinalStep(bot, { x: 1, y: 64, z: 1 }, policy), { x: -1, y: 64, z: 0 });
});

test('allows leaf-only clearance in an explicit cardinal detour', () => {
  const blocks = new Map([
    ['1,63,0', { name: 'grass_block', position: new Vec3(1, 63, 0), boundingBox: 'block' }],
    ['1,64,0', { name: 'oak_leaves', position: new Vec3(1, 64, 0), boundingBox: 'block' }],
    ['1,63,1', { name: 'grass_block', position: new Vec3(1, 63, 1), boundingBox: 'block' }]
  ]);
  const bot = {
    entity: { position: new Vec3(0.5, 64, 0.5) },
    blockAt: (position) => blocks.get(value(position)) || { name: 'air', position, boundingBox: 'empty' }
  };
  const policy = { leafSupport: 'always', logSupport: 'stump' };
  assert.deepEqual(localCardinalStep(bot, { x: 1, y: 64, z: 1 }, policy), { x: 1, y: 64, z: 0 });
});

test('routes around a rejected movement edge', () => {
  const blocks = new Map();
  for (let x = -1; x <= 1; x += 1) for (let z = 0; z <= 1; z += 1) blocks.set(`${x},63,${z}`, { name: 'grass_block', position: new Vec3(x, 63, z), boundingBox: 'block' });
  const bot = {
    entity: { position: new Vec3(0.5, 64, 0.5) },
    blockAt: (position) => blocks.get(value(position)) || { name: 'air', position, boundingBox: 'empty' }
  };
  const policy = { leafSupport: 'always', logSupport: 'stump' };
  const blocked = new Set([movementKey({ x: 0, y: 64, z: 0 }, { x: 1, y: 64, z: 0 })]);
  assert.deepEqual(localCardinalStep(bot, { x: 1, y: 64, z: 0 }, policy, 4, blocked), { x: 0, y: 64, z: 1 });
});

test('runs collection and replanting after each completed tree', async () => {
  const { bot, service } = fixture(4);
  bot.inventory = { items: () => [] };
  const phases = [];
  service.fell = async () => { phases.push('fell'); };
  service.collectDrops = async () => { phases.push('collect'); return { collected: 5, skipped: 1 }; };
  service.replant = async () => { phases.push('replant'); return { planted: 1, skipped: 0 }; };
  const tree = discoverTree(service.reader(bot), { x: 0, y: 64, z: 0 });
  const state = {
    running: true,
    treesFound: 1,
    treesFinished: 0,
    logsMined: 0,
    logsSkipped: 0,
    itemsCollected: 0,
    dropsSkipped: 0,
    saplingsPlanted: 0,
    replantSkipped: 0
  };
  await service.run([tree], normalizeTreePolicy({ replant: 'available' }), state);
  assert.deepEqual(phases, ['fell', 'collect', 'replant']);
  assert.equal(state.treesFinished, 1);
  assert.equal(state.itemsCollected, 5);
  assert.equal(state.dropsSkipped, 1);
  assert.equal(state.saplingsPlanted, 1);
});
