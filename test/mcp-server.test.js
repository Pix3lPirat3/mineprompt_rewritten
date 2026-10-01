'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = require('@modelcontextprotocol/sdk/inMemory.js');
const { createMcpServer } = require('../src/mcp');

test('serves generated tools through the MCP protocol', async (context) => {
  const calls = [];
  const definitions = [{
    name: 'mineprompt_status',
    title: 'MinePrompt Status',
    description: 'Read status.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    outputSchema: null,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  }];
  const runtime = {
    tools: async () => definitions,
    callTool: async (name, input, origin) => {
      calls.push({ name, input, origin });
      return { ok: true, status: 'online' };
    }
  };
  const facade = { runtime, close: async () => {}, ownsHost: false };
  const server = createMcpServer(facade);
  const client = new Client({ name: 'mineprompt-test', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  context.after(async () => {
    await client.close();
    await server.close();
  });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const listed = await client.listTools();
  assert.equal(listed.tools[0].name, 'mineprompt_status');
  const result = await client.callTool({ name: 'mineprompt_status', arguments: {} });
  assert.equal(result.structuredContent.status, 'online');
  assert.equal(calls[0].origin.type, 'agent');
  assert.equal(calls[0].origin.client, 'mineprompt-test');
});
