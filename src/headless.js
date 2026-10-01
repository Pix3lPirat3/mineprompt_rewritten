'use strict';

const path = require('node:path');
const { HostClient } = require('./main/host-client');
const { HostServer } = require('./main/host-server');
const { userDataPath } = require('./main/host-endpoint');
const { stderrConsole } = require('./mcp');

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

async function serve(dataPath) {
  const host = await new HostServer({ rootPath: path.resolve(__dirname, '..'), userDataPath: dataPath, originalConsole: stderrConsole }).start();
  console.log(`MinePrompt headless host is running at ${host.endpoint}.`);
  const close = () => void host.close().finally(() => process.exit(0));
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
  return host;
}

async function connectClient(dataPath) {
  return new HostClient({ userDataPath: dataPath }).open();
}

async function main(args = process.argv.slice(2)) {
  const configuredPath = option(args, '--data-dir');
  const dataPath = configuredPath ? path.resolve(configuredPath) : userDataPath();
  const command = args.find((argument) => !argument.startsWith('--') && argument !== configuredPath) || 'serve';
  if (command === 'serve') return serve(dataPath);
  if (command === 'exec') {
    const index = args.indexOf('exec');
    const client = await connectClient(dataPath);
    try {
      const result = await client.execute(args.slice(index + 1).join(' '));
      console.log(JSON.stringify(result, null, 2));
      return result;
    } finally {
      await client.close();
    }
  }
  if (command === 'tools') {
    let client;
    let host;
    try {
      client = await connectClient(dataPath);
    } catch {
      host = await new HostServer({ rootPath: path.resolve(__dirname, '..'), userDataPath: dataPath, originalConsole: stderrConsole }).start();
    }
    try {
      const runtime = client || host.runtime;
      const format = option(args, '--format') || 'mcp';
      const tools = format === 'openai' ? await runtime.openAiTools() : await runtime.tools();
      console.log(JSON.stringify(tools, null, 2));
      return tools;
    } finally {
      if (client) await client.close();
      if (host) await host.close();
    }
  }
  throw new Error('Usage: node src/headless.js [serve | exec <command> | tools --format mcp|openai] [--data-dir <path>]');
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = { connectClient, main, option, serve };
