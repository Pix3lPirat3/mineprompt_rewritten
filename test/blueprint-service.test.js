'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Vec3 } = require('vec3');
const { BlueprintService } = require('../src/main/blueprint-service');

function fixture() {
  const blueprint = {
    id: 'plan',
    hash: 'a'.repeat(64),
    name: 'Plan',
    edition: 'java',
    version: '1.21.11',
    dimensions: { x: 2, y: 1, z: 1 },
    offset: { x: 0, y: 0, z: 0 },
    palette: [{ state: 'minecraft:stone', namespace: 'minecraft', name: 'stone', displayName: 'Stone', item: 'stone', itemDisplayName: 'Stone', air: false, supported: true, needsSupport: false }],
    blocks: [0, 0],
    blockEntities: []
  };
  const bot = {
    version: '1.21.11',
    entity: { id: 1, position: new Vec3(0, 64, -3) },
    entities: {},
    inventory: { items: () => [{ name: 'stone', count: 2 }] },
    blockAt(position) {
      const name = position.y <= 63 ? 'stone' : 'air';
      return { name, stateId: name === 'stone' ? 1 : 0, diggable: true, position: new Vec3(position.x, position.y, position.z), getProperties: () => ({}) };
    }
  };
  const library = { resolve: () => blueprint, list: () => [], inspect: () => blueprint, materials: () => ({}) };
  return { bot, service: new BlueprintService({ library, getClient: () => ({ bot }) }) };
}

test('compiles a bounded public placement and stance plan', async () => {
  const { service } = fixture();
  const plan = await service.plan('plan', { anchor: { x: 0, y: 64, z: 0 } });
  assert.equal(plan.graph.counts.operations, 2);
  assert.equal(plan.graph.counts.blocked, 0);
  assert.equal(plan.stances.counts.covered, 2);
  assert.equal(plan.graph.operationSamples.length, 2);
  assert.equal(Object.hasOwn(plan.preview, 'records'), false);
  assert.equal(Object.hasOwn(plan.preview, 'transformed'), false);
});
