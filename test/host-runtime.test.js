'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { HostClient } = require('../src/main/host-client');
const { HostServer } = require('../src/main/host-server');

const quietConsole = Object.freeze({ log() {}, info() {}, warn() {}, error() {}, debug() {} });

test('shares one runtime with authenticated local clients', async (context) => {
  const dataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'mineprompt-host-'));
  const host = await new HostServer({ rootPath: path.resolve(__dirname, '..'), userDataPath: dataPath, originalConsole: quietConsole }).start();
  const client = await new HostClient({ userDataPath: dataPath, timeout: 3000 }).open();
  context.after(async () => {
    await client.close();
    await host.close();
    await fs.rm(dataPath, { recursive: true, force: true });
  });
  assert.equal(client.snapshot().selectedSessionId, 'primary');
  assert.equal(client.snapshot().sessions[0].process.isolated, true);
  const added = await client.relationshipAdd({ kind: 'friend', username: 'Alex' });
  assert.equal(added.relationship.username, 'Alex');
  assert.equal((await client.relationshipsList()).length, 1);
  const tools = await client.tools();
  assert.equal(tools.some((entry) => entry.name === 'command_friends'), true);
  assert.equal(tools.some((entry) => entry.name === 'mineprompt_inventory_inspect'), true);
  assert.equal(tools.some((entry) => entry.name === 'mineprompt_debug_evaluate'), true);
  assert.equal(tools.some((entry) => entry.name === 'mineprompt_ui_state'), true);
  assert.equal(tools.some((entry) => entry.name === 'mineprompt_diagnostics'), true);
  assert.equal(tools.some((entry) => entry.name === 'mineprompt_stash'), true);
  assert.equal(tools.some((entry) => entry.name === 'mineprompt_reload'), true);
  await client.reportRendererState({ viewport: { width: 1440 }, rendered: { contextMenus: 1 } });
  await client.reportRendererIssue({ area: 'React', message: 'Maximum update depth exceeded', context: { componentStack: 'InventoryWorkspace' }, timestamp: Date.now() });
  const uiState = await client.uiState({ maximumIssues: 5 });
  assert.equal(uiState.renderer.viewport.width, 1440);
  assert.equal(uiState.rendererIssues[0].message, 'Maximum update depth exceeded');
  assert.equal(uiState.session.diagnostics.inventory.received, 0);
  assert.equal((await client.diagnostics()).sessions[0].inventoryPipeline.received, 0);
  const executed = await client.callTool('command_friends', { arguments: ['check', 'Alex'] }, { type: 'agent' });
  assert.equal(executed.ok, true);
  assert.equal((await client.execute('friends check Alex')).ok, true);
  assert.equal((await client.callTool('mineprompt_mining', { sessionId: 'primary', action: 'status' }, { type: 'agent' })).ok, true);
  assert.equal((await client.callTool('mineprompt_stash', { sessionId: 'primary', action: 'status' }, { type: 'agent' })).ok, true);
  assert.equal((await client.reload({ sessionId: 'primary', scope: 'commands' })).ok, true);
  await assert.rejects(
    client.targetAction({ sessionId: 'primary', actionId: 'entity.goto', entityId: 7 }),
    /An active connection is required/u
  );
  const attention = [];
  client.on('event', (channel) => { if (channel === 'attention') attention.push(channel); });
  await client.close();
  await new Promise((resolve) => { globalThis.setImmediate(resolve); });
  assert.deepEqual(attention, []);
});
