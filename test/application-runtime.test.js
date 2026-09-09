'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { ApplicationRuntime } = require('../src/main/application-runtime');

test('runs global commands through the application runtime', async (context) => {
  const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'mineprompt-runtime-'));
  const events = [];
  const runtime = await new ApplicationRuntime({
    rootPath: path.resolve(__dirname, '..'),
    userDataPath,
    emit: (type, payload) => events.push({ type, payload })
  }).init();
  context.after(async () => {
    await runtime.close();
    await fs.rm(userDataPath, { recursive: true, force: true });
  });

  assert.equal(runtime.snapshot().commands.length, 9);
  assert.equal((await runtime.execute('account add "Test Player" offline')).ok, true);
  assert.equal((await runtime.execute('settings resource-packs accept')).ok, true);
  assert.deepEqual(runtime.snapshot().accounts, [{ username: 'Test Player', authentication: false }]);
  assert.equal(await runtime.store.getSetting('resourcePackPolicy'), 'accept');
  assert.equal(events.some((event) => event.type === 'snapshot'), true);
});

test('validates profile and security preference updates', async (context) => {
  const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'mineprompt-preferences-'));
  const runtime = await new ApplicationRuntime({
    rootPath: path.resolve(__dirname, '..'),
    userDataPath,
    emit: () => {}
  }).init();
  context.after(async () => {
    await runtime.close();
    await fs.rm(userDataPath, { recursive: true, force: true });
  });

  await runtime.saveProfile({ username: 'ExamplePlayer', authentication: 'microsoft' });
  assert.deepEqual(runtime.snapshot().accounts, [{ username: 'ExamplePlayer', authentication: true }]);
  const result = await runtime.savePreferences({
    resourcePackPolicy: 'accept',
    externalPlayerHeadsEnabled: true,
    remoteCommandsEnabled: true,
    remoteCommandPlayers: ['Builder_1', 'builder_1', 'Helper2'],
    remoteCommandCapabilities: ['status', 'movement'],
    automaticReconnectEnabled: true,
    reconnectAttempts: 4
  });
  assert.deepEqual(result.preferences, {
    resourcePackPolicy: 'accept',
    externalPlayerHeadsEnabled: true,
    remoteCommandsEnabled: true,
    remoteCommandPlayers: ['Builder_1', 'Helper2'],
    remoteCommandCapabilities: ['status', 'movement'],
    automaticReconnectEnabled: true,
    reconnectAttempts: 4
  });
  await assert.rejects(runtime.savePreferences({ resourcePackPolicy: 'ask' }), /Invalid resource-pack/u);
  await assert.rejects(runtime.saveProfile({ username: 'Another', authentication: 'password' }), /authentication mode/u);
  await assert.rejects(runtime.savePreferences({
    resourcePackPolicy: 'deny',
    remoteCommandPlayers: ['invalid player']
  }), /letters, numbers/u);
  await runtime.removeProfile('ExamplePlayer');
  assert.deepEqual(runtime.snapshot().accounts, []);

  await runtime.saveServer({ name: 'Local', host: 'localhost', port: 25565, version: '', fakeHost: '' });
  assert.deepEqual(runtime.snapshot().servers, [{ name: 'Local', host: 'localhost', port: 25565, version: '', fakeHost: '' }]);
  await runtime.removeServer('Local');
  assert.deepEqual(runtime.snapshot().servers, []);
});

test('completes connected commands from the full terminal input', async (context) => {
  const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'mineprompt-completion-'));
  const runtime = await new ApplicationRuntime({
    rootPath: path.resolve(__dirname, '..'),
    userDataPath,
    emit: () => {}
  }).init();
  context.after(async () => {
    runtime.client.bot = null;
    await runtime.close();
    await fs.rm(userDataPath, { recursive: true, force: true });
  });

  const diamond = { slot: 36, name: 'diamond', displayName: 'Diamond', count: 2 };
  runtime.client.bot = {
    entity: {},
    inventory: {
      slots: Array.from({ length: 46 }, (_, index) => index === 36 ? diamond : null),
      inventoryStart: 9,
      inventoryEnd: 46,
      hotbarStart: 36,
      items: () => [diamond]
    },
    players: {
      PlayerOne: { username: 'PlayerOne' },
      PixelPirate: { username: 'PixelPirate' }
    }
  };
  runtime.commands.setCommands('mineflayer');

  const completions = await runtime.complete('follow P');
  assert.equal(completions.includes('PlayerOne'), true);
  assert.equal(completions.includes('PixelPirate'), true);
  assert.equal((await runtime.complete('inventory equip d')).includes('diamond'), true);
  assert.equal((await runtime.complete('inventory equip diamond ')).includes('hand'), true);
  const apple = { slot: 2, name: 'apple', displayName: 'Apple', count: 4 };
  runtime.client.bot.currentWindow = {
    id: 4,
    slots: Array.from({ length: 46 }, (_, index) => index === 2 ? apple : index === 9 ? diamond : null),
    inventoryStart: 9,
    inventoryEnd: 46,
    hotbarStart: 37,
    items: () => [diamond],
    containerItems: () => [apple]
  };
  assert.equal((await runtime.complete('container take a')).includes('apple'), true);
  assert.equal((await runtime.complete('container take apple ')).includes('one'), true);
});

test('exports bounded diagnostics without saved identities or servers', async (context) => {
  const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'mineprompt-diagnostics-'));
  const runtime = await new ApplicationRuntime({
    rootPath: path.resolve(__dirname, '..'),
    userDataPath,
    emit: () => {}
  }).init();
  context.after(async () => {
    await runtime.close();
    await fs.rm(userDataPath, { recursive: true, force: true });
  });
  await runtime.saveProfile({ username: 'private@example.test', authentication: 'microsoft' });
  await runtime.saveServer({ name: 'Private Network', host: 'secret.example.test', port: 25565 });
  runtime.logger.warn('private@example.test connected to secret.example.test');
  const diagnostics = JSON.stringify(runtime.diagnostics());
  assert.doesNotMatch(diagnostics, /private@example\.test/u);
  assert.doesNotMatch(diagnostics, /secret\.example\.test/u);
  assert.match(diagnostics, /\[redacted\]/u);
});
