'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Vec3 } = require('vec3');
const { selectPathAwareStep } = require('../src/main/path-cost-planner');

test('prefers lower real path cost over shorter geometric travel', async () => {
  const costs = new Map([[0, 12], [2, 1]]);
  const bot = {
    entity: { position: new Vec3(0, 64, 0) },
    pathfinder: {
      movements: {},
      getPathFromTo: function * getPathFromTo(movements, start, goal) {
        yield { result: { status: 'success', cost: costs.get(goal.x), path: [] } };
      }
    }
  };
  const result = await selectPathAwareStep(bot, [{ x: 1, y: 64, z: 0 }], [{ x: 0, y: 64, z: 2 }, { x: 2, y: 64, z: 2 }], 4.8);
  assert.equal(result.stand.x, 2);
  assert.equal(result.pathCost, 1);
  assert.equal(result.checked, 2);
});

test('falls back to geometric ranking when path estimates are unresolved', async () => {
  const bot = {
    entity: { position: new Vec3(0, 64, 0) },
    pathfinder: {
      movements: {},
      getPathFromTo: function * getPathFromTo() {
        yield { result: { status: 'noPath', cost: 0, path: [] } };
      }
    }
  };
  const result = await selectPathAwareStep(bot, [{ x: 0, y: 64, z: 0 }], [{ x: 0, y: 64, z: 2 }, { x: 3, y: 64, z: 2 }], 4.8);
  assert.equal(result.stand.x, 0);
  assert.equal(result.pathStatus, 'unresolved');
});
