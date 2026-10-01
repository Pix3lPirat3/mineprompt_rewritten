'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Vec3 } = require('vec3');
const { expectedLogDrops, plantingSites, relevantDrop, replantTree, waitForTreeDropWave } = require('../src/main/tree-lifecycle');

function block(name, x, y, z) {
  return { name, position: new Vec3(x, y, z), boundingBox: name === 'air' ? 'empty' : 'block' };
}

test('filters item drops by the discovered tree volume', () => {
  const tree = { logs: [{ x: 0, y: 64, z: 0 }] };
  assert.equal(relevantDrop({ name: 'item', position: new Vec3(2, 64, 0) }, tree, 4), true);
  assert.equal(relevantDrop({ name: 'item', position: new Vec3(8, 64, 0) }, tree, 4), false);
  assert.equal(relevantDrop({ name: 'zombie', position: new Vec3(1, 64, 0) }, tree, 4), false);
});

test('waits for delayed tree-drop entity packets', async () => {
  const item = { id: 7, name: 'item', position: new Vec3(0.5, 64, 0.5) };
  let ticks = 0;
  const bot = {
    entity: { position: new Vec3(1, 64, 0) },
    entities: {},
    waitForTicks: async (count) => {
      ticks += count;
      if (ticks >= 6) bot.entities[item.id] = item;
    }
  };
  const drops = await waitForTreeDropWave(bot, { logs: [{ x: 0, y: 64, z: 0 }] }, 8, new Set(), 10);
  assert.deepEqual(drops, [item]);
  assert.equal(ticks, 6);
});

test('accounts for collected and pending logs without counting leaf drops', () => {
  const oakLog = { type: 1, metadata: 0, name: 'oak_log', count: 2 };
  const sapling = { type: 2, metadata: 0, name: 'oak_sapling', count: 4 };
  const bot = { inventory: { items: () => [oakLog, sapling] } };
  const pending = new Set([
    { getDroppedItem: () => ({ name: 'oak_log', count: 3 }) },
    { getDroppedItem: () => ({ name: 'stick', count: 2 }) }
  ]);
  assert.equal(expectedLogDrops(bot, { species: 'oak' }, new Map(), pending), 5);
});

test('selects only clear original bases on plantable soil', () => {
  const values = new Map([
    ['0,63,0', block('dirt', 0, 63, 0)],
    ['1,63,0', block('stone', 1, 63, 0)]
  ]);
  const bot = { blockAt: (position) => values.get(`${position.x},${position.y},${position.z}`) || block('air', position.x, position.y, position.z) };
  const sites = plantingSites(bot, { base: [{ x: 1, y: 64, z: 0 }, { x: 0, y: 64, z: 0 }] });
  assert.deepEqual(sites, [{ x: 0, y: 64, z: 0 }]);
});

test('replants every validated base with the matching sapling', async () => {
  const values = new Map([
    ['0,63,0', block('dirt', 0, 63, 0)],
    ['1,63,0', block('dirt', 1, 63, 0)]
  ]);
  const item = { name: 'dark_oak_sapling', count: 4, slot: 10 };
  const placed = [];
  const bot = {
    entity: { position: new Vec3(0.5, 64, 2.5) },
    inventory: { items: () => [item] },
    blockAt: (position) => values.get(`${position.x},${position.y},${position.z}`) || block('air', position.x, position.y, position.z),
    equip: async () => {},
    lookAt: async () => {},
    placeBlock: async (soil) => { placed.push(`${soil.position.x},${soil.position.y + 1},${soil.position.z}`); item.count -= 1; }
  };
  const tree = { species: 'dark_oak', base: [{ x: 0, y: 64, z: 0 }, { x: 1, y: 64, z: 0 }] };
  const result = await replantTree(bot, tree, { replant: 'required' });
  assert.equal(result.planted, 2);
  assert.deepEqual(placed, ['0,64,0', '1,64,0']);
});

test('skips the whole replant when available mode lacks saplings', async () => {
  const bot = {
    entity: { position: new Vec3(0.5, 64, 2.5) },
    inventory: { items: () => [] },
    blockAt: (position) => position.y === 63 ? block('dirt', position.x, position.y, position.z) : block('air', position.x, position.y, position.z)
  };
  const result = await replantTree(bot, { species: 'oak', base: [{ x: 0, y: 64, z: 0 }] }, { replant: 'available' });
  assert.equal(result.planted, 0);
  assert.match(result.reason, /oak sapling/u);
});
