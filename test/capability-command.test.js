'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const command = require('../commands/mineflayer/capability');

function fixture() {
  const replies = [];
  const calls = [];
  const snapshot = {
    capabilities: [{ id: 'trees', version: 1, description: 'Tree behavior.' }],
    actions: [{ id: 'trees.inspect', title: 'Inspect tree', inputSchema: { type: 'object' } }],
    tasks: { active: [{ id: 'trees.farm', status: 'running', detail: 'Working' }] }
  };
  const runtime = {
    snapshot: () => snapshot,
    actions: { execute: async (id, input) => { calls.push({ id, input }); return { ok: true }; } },
    tasks: { stop: (id) => id === 'trees.farm' }
  };
  return { bot: { mineprompt: runtime }, calls, replies, sender: { reply: (message) => replies.push(message) } };
}

test('lists, completes, and executes installed capability actions', async () => {
  const value = fixture();
  await command.execute(value.sender, 'capability', ['list'], { bot: value.bot });
  await command.execute(value.sender, 'capability', ['run', 'trees.inspect', '{"target":"nearest"}'], { bot: value.bot });
  assert.match(value.replies[0], /trees@1/u);
  assert.deepEqual(value.calls, [{ id: 'trees.inspect', input: { target: 'nearest' } }]);
  assert.deepEqual(command.autocomplete('capability', ['run'], { bot: value.bot }, { trailingSpace: true }), ['trees.inspect']);
  assert.deepEqual(command.autocomplete('capability', ['stop'], { bot: value.bot }, { trailingSpace: true }), ['trees.farm']);
});

test('rejects non-object capability input', async () => {
  const value = fixture();
  await command.execute(value.sender, 'capability', ['run', 'trees.inspect', '[]'], { bot: value.bot });
  assert.match(value.replies[0], /JSON object/u);
  assert.equal(value.calls.length, 0);
});
