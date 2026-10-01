'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Vec3 } = require('vec3');
const { ActivityManager } = require('../src/main/activity-manager');
const { discoverTree } = require('../src/main/tree-planner');
const { normalizeTreePolicy } = require('../src/main/tree-policy');
const { TreeService } = require('../src/main/tree-service');

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
    entity: { position: new Vec3(1, 64, 0), eyeHeight: 1.62 },
    blockAt: (position) => blocks.get(value(position)) || { name: 'air', position: new Vec3(position.x, position.y, position.z), boundingBox: 'empty' },
    blockAtCursor: () => blocks.get('0,64,0'),
    canSeeBlock: () => true,
    pathfinder: {
      goto: async (goal) => {
        bot.entity.position = new Vec3(goal.x, goal.y, goal.z);
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

test('replans after each dig and removes the stump after using it', async () => {
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
