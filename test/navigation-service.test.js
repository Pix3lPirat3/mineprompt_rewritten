'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Vec3 } = require('vec3');
const { cancelNavigation, navigateGoal } = require('../src/main/navigation-service');

function goal(x) {
  return { isEnd: (position) => position.x === x };
}

test('rejects a pathfinder result that did not reach its goal', async () => {
  const destination = goal(4);
  const calls = [];
  const bot = {
    entity: { position: new Vec3(0, 64, 0) },
    pathfinder: {
      goal: destination,
      goto: async () => {},
      setGoal: (value) => calls.push(value)
    },
    clearControlStates: () => calls.push('clear')
  };
  await assert.rejects(navigateGoal(bot, destination, { description: 'test goal' }), /stopped before reaching/u);
  assert.deepEqual(calls, [null, 'clear']);
});

test('verifies arrival and clears the completed goal', async () => {
  const destination = goal(4);
  const calls = [];
  const bot = {
    entity: { position: new Vec3(0, 64, 0) },
    pathfinder: {
      goal: destination,
      goto: async () => { bot.entity.position = new Vec3(4, 64, 0); },
      setGoal: (value) => calls.push(value)
    },
    clearControlStates: () => calls.push('clear')
  };
  await navigateGoal(bot, destination, { description: 'test goal' });
  assert.deepEqual(calls, [null, 'clear']);
});

test('cancels an idle path without latching pathfinder stop', () => {
  const calls = [];
  cancelNavigation({ pathfinder: { setGoal: (value) => calls.push(value), stop: () => calls.push('stop') }, clearControlStates: () => calls.push('clear') });
  assert.deepEqual(calls, [null, 'clear']);
});
