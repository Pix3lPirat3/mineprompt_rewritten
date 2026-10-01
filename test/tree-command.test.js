'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const command = require('../commands/mineflayer/world/tree');

function sender() {
  const replies = [];
  return { replies, value: { reply: (message) => replies.push(message) } };
}

function fixture() {
  const calls = [];
  const status = { policy: { leafSupport: 'safe', logSupport: 'stump', requireNatural: true }, treesFound: 3 };
  return {
    calls,
    context: {
      store: { snapshot: () => ({ miningPresets: [], activeMiningPresetId: null }) },
      trees: {
        inspect: (request) => { calls.push(['inspect', request]); return { message: '[Tree] Oak\nLogs: 7' }; },
        start: (request) => { calls.push(['start', request]); return status; },
        status: () => ({ phase: 'felling', treesFinished: 1, treesFound: 3, logsMined: 9, failed: null }),
        stop: () => true
      }
    }
  };
}

test('maps tree commands to one service with mining and support policies', () => {
  const { calls, context } = fixture();
  const inspect = sender();
  command.execute(inspect.value, 'tree', ['inspect', '1', '64', '-2', '--leaf-support', 'never'], context);
  const farm = sender();
  command.execute(farm.value, 'tree', ['farm', '--radius', '24', '--max-trees', '6', '--collection-radius', '10', '--replant', 'available', '--on-failure', 'skip', '--allow-uncertain'], context);
  assert.deepEqual(calls[0][1].position, { x: 1, y: 64, z: -2 });
  assert.equal(calls[0][1].policy.leafSupport, 'never');
  assert.equal(calls[1][1].mode, 'farm');
  assert.equal(calls[1][1].policy.radius, 24);
  assert.equal(calls[1][1].policy.maxTrees, 6);
  assert.equal(calls[1][1].policy.collectionRadius, 10);
  assert.equal(calls[1][1].policy.replant, 'available');
  assert.equal(calls[1][1].policy.onFailure, 'skip');
  assert.equal(calls[1][1].policy.requireNatural, false);
  assert.match(inspect.replies[0], /Logs: 7/u);
  assert.match(farm.replies[0], /Farming 3 trees/u);
});

test('reports and stops the current tree activity', () => {
  const { context } = fixture();
  const status = sender();
  command.execute(status.value, 'tree', ['status'], context);
  const stop = sender();
  command.execute(stop.value, 'tree', ['stop'], context);
  assert.match(status.replies[0], /1\/3 trees/u);
  assert.equal(stop.replies[0], '[Tree] Stopping.');
});

test('completes policy values in place', () => {
  const { context } = fixture();
  assert.deepEqual(command.autocomplete('tree', ['fell', '--replant'], context, { trailingSpace: true }), ['never', 'available', 'required']);
  assert.deepEqual(command.autocomplete('tree', ['fell', '--leaf-support'], context, { trailingSpace: true }), ['never', 'safe', 'always']);
  assert.deepEqual(command.autocomplete('tree', ['farm', '--on-failure'], context, { trailingSpace: true }), ['stop', 'skip']);
});
