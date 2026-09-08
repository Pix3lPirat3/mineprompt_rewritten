'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Store, cleanData } = require('../src/main/store');

test('normalizes persisted data', () => {
  assert.deepEqual(cleanData({ accounts: [{ username: 'Alex', authentication: 'microsoft' }] }).accounts, [
    { username: 'Alex', authentication: true }
  ]);
});

test('persists accounts, settings, and bounded connection history', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mineprompt-store-'));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'data.json');
  const store = await new Store(file).init();

  assert.equal(await store.addAccount('Alex', true), true);
  assert.equal(await store.addAccount('alex', false), false);
  await store.setSetting('resourcePackPolicy', 'deny');
  for (let index = 0; index < 25; index += 1) await store.addConnection(`-u Alex -h server-${index}.test`);
  await store.close();

  const restored = await new Store(file).init();
  assert.equal((await restored.getAccounts()).length, 1);
  assert.equal(await restored.getSetting('resourcePackPolicy'), 'deny');
  assert.equal(restored.snapshot().connections.length, 20);
  assert.match(await restored.getConnection(), /server-24/);
});

test('backs up malformed data instead of failing startup', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mineprompt-corrupt-'));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'data.json');
  await fs.writeFile(file, '{broken', 'utf8');
  const store = await new Store(file).init();
  assert.deepEqual(await store.getAccounts(), []);
  assert.equal((await fs.readdir(directory)).some((entry) => entry.includes('.corrupt-')), true);
});

test('creates and edits profiles without allowing duplicates', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mineprompt-profiles-'));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = await new Store(path.join(directory, 'data.json')).init();

  await store.saveAccount({ username: 'Alex', authentication: false });
  await store.saveAccount({ username: 'Builder@example.com', authentication: true });
  await store.saveAccount({ originalUsername: 'Alex', username: 'AlexTwo', authentication: true });
  await assert.rejects(
    store.saveAccount({ originalUsername: 'AlexTwo', username: 'builder@example.com', authentication: false }),
    /already saved/u
  );
  await assert.rejects(
    store.saveAccount({ originalUsername: 'Missing', username: 'NewName', authentication: false }),
    /no longer exists/u
  );
  await assert.rejects(store.saveAccount({ username: '\n', authentication: false }), /valid account/u);
  await store.setSettings({ resourcePackPolicy: 'accept', remoteCommandsEnabled: false });

  assert.deepEqual(await store.getAccounts(), [
    { username: 'AlexTwo', authentication: true },
    { username: 'Builder@example.com', authentication: true }
  ]);
  assert.equal(await store.getSetting('resourcePackPolicy'), 'accept');
});

test('merges a resolved Microsoft identity with an existing profile', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mineprompt-identities-'));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = await new Store(path.join(directory, 'data.json')).init();
  await store.addAccount('player@example.com', true);
  await store.addAccount('ResolvedPlayer', false);
  assert.equal(await store.renameAccount('player@example.com', 'ResolvedPlayer'), true);
  assert.deepEqual(await store.getAccounts(), [{ username: 'ResolvedPlayer', authentication: true }]);
});
