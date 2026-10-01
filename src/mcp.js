'use strict';

const path = require('node:path');
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const packageJson = require('../package.json');
const { HostClient } = require('./main/host-client');
const { HostServer } = require('./main/host-server');
const { userDataPath } = require('./main/host-endpoint');

const stderrConsole = Object.freeze({
  log: (...parts) => console.error(...parts),
  info: (...parts) => console.error(...parts),
  warn: (...parts) => console.error(...parts),
  error: (...parts) => console.error(...parts),
  debug: (...parts) => console.error(...parts)
});

async function runtimeFacade(options = {}) {
  const dataPath = options.userDataPath || userDataPath();
  const client = new HostClient({ userDataPath: dataPath });
  try {
    await client.open();
    return { runtime: client, close: () => client.close(), ownsHost: false };
  } catch {
    const host = await new HostServer({
      rootPath: options.rootPath || path.resolve(__dirname, '..'),
      userDataPath: dataPath,
      originalConsole: stderrConsole
    }).start();
    return { runtime: host.runtime, close: () => host.close(), ownsHost: true };
  }
}

function createMcpServer(facade) {
  const server = new Server({ name: 'mineprompt', version: packageJson.version }, {
    capabilities: { tools: { listChanged: true } },
    instructions: 'Control MinePrompt through typed tools. Read session status before state-changing calls. Use mineprompt_ui_state and mineprompt_diagnostics to inspect the GUI, live inventory and container state, renderer failures, and inventory pipeline performance. Use mineprompt_reload for command or renderer changes that do not require a backend process restart. Prefer the read-only inventory inspector for item details. Friend protection overrides require explicit user approval. Debug evaluation is intentionally unsafe and requires explicit user approval for every call.'
  });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: (await facade.runtime.tools()).map((definition) => ({
      name: definition.name,
      title: definition.title,
      description: definition.description,
      inputSchema: definition.inputSchema,
      ...(definition.outputSchema ? { outputSchema: definition.outputSchema } : {}),
      annotations: definition.annotations
    }))
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const value = await facade.runtime.callTool(request.params.name, request.params.arguments || {}, {
        type: 'agent',
        client: server.getClientVersion()?.name || 'mcp',
        capabilities: ['relationships.read', 'relationships.write', 'relationships.override', 'players.control', 'inventory', 'debug']
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(value ?? { ok: true }, null, 2) }],
        ...(value && typeof value === 'object' && !Array.isArray(value) ? { structuredContent: value } : {})
      };
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: error.message }] };
    }
  });
  return server;
}

async function startMcp(options = {}) {
  const facade = options.facade || await runtimeFacade(options);
  const server = createMcpServer(facade);
  const transport = options.transport || new StdioServerTransport();
  await server.connect(transport);
  const close = async () => {
    await server.close();
    await facade.close();
  };
  return { server, facade, close };
}

if (require.main === module) {
  startMcp().then(({ close }) => {
    let closing = false;
    const shutdown = () => {
      if (closing) return;
      closing = true;
      void close().finally(() => process.exit(0));
    };
    process.stdin.once('end', shutdown);
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  }).catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = { createMcpServer, runtimeFacade, startMcp, stderrConsole };
