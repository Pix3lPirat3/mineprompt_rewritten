'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { CommandRegistry, levenshtein } = require('../src/main/command-registry');

test('calculates edit distance for command suggestions', () => {
  assert.equal(levenshtein('conect', 'connect'), 1);
  assert.equal(levenshtein('help', 'help'), 0);
});

test('loads, resolves, completes, and executes commands', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mineprompt-commands-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const commandDirectory = path.join(root, 'commands', 'global');
  const privateCommands = path.join(root, 'local-data', 'commands');
  const privateGlobal = path.join(privateCommands, 'global');
  await fs.mkdir(commandDirectory, { recursive: true });
  await fs.mkdir(privateGlobal, { recursive: true });
  await fs.writeFile(path.join(commandDirectory, 'hello.js'), `module.exports = {
    command: 'hello', aliases: ['hi'], capability: 'status', description: 'Test command',
    execute(sender, command, args) { sender.reply(command + ':' + args.join(',')); }
  };`);
  await fs.writeFile(path.join(privateGlobal, 'local.js'), `module.exports = {
    command: 'localcheck', description: 'Private test command',
    execute(sender) { sender.reply('local-only'); }
  };`);

  const messages = [];
  const logger = { log: (message) => messages.push(message), info() {}, warn: (message) => messages.push(message), error: (message) => messages.push(message), debug() {} };
  const runtimeContext = { bot: null, activities: { stopAll() {} }, client: { reload() {} } };
  const registry = new CommandRegistry({ rootPath: root, privateCommandsPath: privateCommands, logger, getContext: () => runtimeContext });
  registry.setCommands('global');

  assert.equal(registry.getCommand('HI').command, 'hello');
  assert.equal(registry.getCommand('localcheck').command, 'localcheck');
  assert.deepEqual(await registry.complete('he'), ['hello']);
  assert.equal((await registry.execute('hi "there friend"')).ok, true);
  assert.equal((await registry.execute('hello remote', { type: 'player', player: 'Alex', capabilities: [], reply: (message) => messages.push(message) })).ok, false);
  assert.equal((await registry.execute('hello remote', { type: 'player', player: 'Alex', capabilities: ['status'], reply: (message) => messages.push(message) })).ok, true);
  assert.deepEqual(messages, ['hi:there friend', 'The hello command is not allowed for your remote access.', 'hello:remote']);
});
