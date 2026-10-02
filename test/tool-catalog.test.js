'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ToolCatalog } = require('../src/main/tool-catalog');

function fixture() {
  const calls = [];
  const snapshot = {
    selectedSessionId: 'primary',
    sessions: [{ id: 'primary', state: { status: 'online' }, session: { players: [] } }],
    commands: [{
      command: 'hello',
      aliases: [],
      category: 'custom',
      capability: 'status',
      description: 'Say hello.',
      usage: 'hello <name>',
      requiresConnection: false,
      toolName: 'command_hello',
      risk: 'standard',
      approval: 'none'
    }]
  };
  const runtime = {
    snapshot: () => snapshot,
    execute: async (...args) => { calls.push(['execute', ...args]); return { ok: true }; },
    connect: async (...args) => { calls.push(['connect', ...args]); return { ok: true }; },
    disconnect: async (...args) => { calls.push(['disconnect', ...args]); return { ok: true }; },
    selectSession: async (...args) => { calls.push(['select', ...args]); return { ok: true }; },
    uiState: async (...args) => { calls.push(['ui-state', ...args]); return { renderer: {} }; },
    diagnostics: async (...args) => { calls.push(['diagnostics', ...args]); return { rendererIssues: [] }; },
    reload: async (...args) => { calls.push(['reload', ...args]); return { ok: true }; },
    capabilities: async (...args) => { calls.push(['capabilities', ...args]); return { actions: [{ id: 'trees.inspect' }] }; },
    capabilityAction: async (...args) => { calls.push(['capability-action', ...args]); return { ok: true }; },
    playerAction: async (...args) => { calls.push(['player', ...args]); return { ok: true }; },
    targetAction: async (...args) => { calls.push(['target', ...args]); return { ok: true }; },
    miningAction: async (...args) => { calls.push(['mining', ...args]); return { ok: true }; },
    treeAction: async (...args) => { calls.push(['tree', ...args]); return { ok: true }; },
    stashAction: async (...args) => { calls.push(['stash', ...args]); return { ok: true }; },
    inventoryAction: async (...args) => { calls.push(['inventory', ...args]); return { ok: true }; },
    inventoryInspect: async (...args) => { calls.push(['inspect', ...args]); return { ok: true, item: { name: 'diamond_sword' } }; },
    debugEvaluate: async (...args) => { calls.push(['debug', ...args]); return { ok: true, value: 'result' }; },
    relationshipsList: () => [],
    relationshipAdd: async (input) => ({ ok: true, relationship: input }),
    relationshipRemove: async () => ({ ok: true, removed: true })
  };
  return { calls, catalog: new ToolCatalog(runtime) };
}

test('generates MCP and strict OpenAI tools from one catalog', () => {
  const { catalog } = fixture();
  const listed = catalog.list();
  assert.equal(listed.some((entry) => entry.name === 'command_hello'), true);
  assert.equal(listed.some((entry) => entry.name === 'mineprompt_player_action'), true);
  assert.equal(listed.some((entry) => entry.name === 'mineprompt_target_action'), true);
  assert.equal(listed.some((entry) => entry.name === 'mineprompt_mining'), true);
  assert.equal(listed.some((entry) => entry.name === 'mineprompt_tree'), true);
  assert.equal(listed.some((entry) => entry.name === 'mineprompt_reload'), true);
  assert.equal(listed.some((entry) => entry.name === 'mineprompt_capabilities'), true);
  assert.equal(listed.some((entry) => entry.name === 'mineprompt_capability_action'), true);
  assert.equal(listed.some((entry) => entry.name === 'mineprompt_stash'), true);
  assert.equal(listed.find((entry) => entry.name === 'mineprompt_ui_state').annotations.readOnlyHint, true);
  assert.equal(listed.find((entry) => entry.name === 'mineprompt_diagnostics').annotations.readOnlyHint, true);
  assert.equal(listed.find((entry) => entry.name === 'mineprompt_inventory_inspect').annotations.readOnlyHint, true);
  assert.equal(listed.find((entry) => entry.name === 'mineprompt_debug_evaluate').approval, 'required');
  const exported = catalog.openAiTools();
  const connect = exported.find((entry) => entry.name === 'mineprompt_connect');
  assert.equal(connect.strict, true);
  assert.equal(connect.parameters.additionalProperties, false);
  assert.deepEqual(new Set(connect.parameters.required), new Set(Object.keys(connect.parameters.properties)));
  assert.equal(JSON.stringify(exported).includes('execute'), false);
});

test('validates agent input and executes dynamic command tools', async () => {
  const { calls, catalog } = fixture();
  await catalog.call('command_hello', { sessionId: 'primary', arguments: ['Alex Smith'] }, { type: 'agent' });
  assert.equal(calls[0][0], 'execute');
  assert.equal(calls[0][1], 'hello "Alex Smith"');
  await assert.rejects(catalog.call('mineprompt_connect', { username: 'Alex', auth: 'offline' }), /host/u);
  await catalog.call('mineprompt_target_action', { sessionId: 'primary', actionId: 'entity.inspect', entityId: 7 }, { type: 'agent' });
  assert.equal(calls.some((entry) => entry[0] === 'target' && entry[1].entityId === 7), true);
  await catalog.call('mineprompt_mining', {
    sessionId: 'primary',
    action: 'region',
    from: { x: 0, y: 60, z: 0 },
    to: { x: 3, y: 63, z: 3 },
    policy: { tool: 'auto', minimumDurability: 20 }
  }, { type: 'agent' });
  await catalog.call('mineprompt_tree', { sessionId: 'primary', action: 'fell', target: 'nearest', policy: { leafSupport: 'safe', lowDurability: 'switch', collectDrops: true, collectionRadius: 10, replant: 'available' } }, { type: 'agent' });
  assert.equal(calls.some((entry) => entry[0] === 'mining' && entry[1].policy.minimumDurability === 20), true);
  assert.equal(calls.some((entry) => entry[0] === 'tree' && entry[1].action === 'fell'), true);
  await catalog.call('mineprompt_stash', { sessionId: 'primary', action: 'nearby', collectionRadius: 12, containerRadius: 20 }, { type: 'agent' });
  assert.equal(calls.some((entry) => entry[0] === 'stash' && entry[1].containerRadius === 20), true);
  await catalog.call('mineprompt_inventory_inspect', { sessionId: 'primary', scope: 'inventory', target: 36 }, { type: 'agent' });
  await catalog.call('mineprompt_inventory_action', { sessionId: 'primary', connectionId: 3, windowId: null, scope: 'inventory', action: 'swing', target: 36, arm: 'right', showHand: true }, { type: 'agent' });
  await catalog.call('mineprompt_ui_state', { sessionId: 'primary', maximumIssues: 5 }, { type: 'agent' });
  await catalog.call('mineprompt_diagnostics', {}, { type: 'agent' });
  await catalog.call('mineprompt_reload', { sessionId: 'primary', scope: 'commands' }, { type: 'agent' });
  await catalog.call('mineprompt_capabilities', { sessionId: 'primary' }, { type: 'agent' });
  await catalog.call('mineprompt_capability_action', { sessionId: 'primary', actionId: 'trees.inspect', inputJson: '{"target":"nearest"}' }, { type: 'agent' });
  await catalog.call('mineprompt_debug_evaluate', { sessionId: 'primary', code: 'bot.inventory.slots[36]', acknowledgeUnsafe: true }, { type: 'agent' });
  assert.equal(calls.some((entry) => entry[0] === 'inspect' && entry[1].target === 36), true);
  assert.equal(calls.some((entry) => entry[0] === 'inventory' && entry[1].action === 'swing' && entry[1].arm === 'right'), true);
  assert.equal(calls.some((entry) => entry[0] === 'debug' && entry[1].code.includes('inventory')), true);
  assert.equal(calls.some((entry) => entry[0] === 'ui-state' && entry[1].maximumIssues === 5), true);
  assert.equal(calls.some((entry) => entry[0] === 'diagnostics'), true);
  assert.equal(calls.some((entry) => entry[0] === 'reload' && entry[1].scope === 'commands'), true);
  assert.equal(calls.some((entry) => entry[0] === 'capabilities'), true);
  assert.equal(calls.some((entry) => entry[0] === 'capability-action' && entry[1].input.target === 'nearest'), true);
  await assert.rejects(catalog.call('mineprompt_capability_action', { actionId: 'trees.inspect', inputJson: '[]' }), /JSON object/u);
});
