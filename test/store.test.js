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
  for (let index = 0; index < 25; index += 1) {
    await store.addConnection({ username: 'Alex', auth: 'offline', host: `server-${index}.test`, port: 25565, version: '', fakeHost: '' });
  }
  await store.close();

  const restored = await new Store(file).init();
  assert.equal((await restored.getAccounts()).length, 1);
  assert.equal(await restored.getSetting('resourcePackPolicy'), 'deny');
  assert.equal(restored.snapshot().connections.length, 20);
  assert.equal((await restored.getConnection()).host, 'server-24.test');
});

test('creates and edits server profiles without duplicates', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mineprompt-servers-'));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = await new Store(path.join(directory, 'data.json')).init();
  await store.saveServer({ name: 'Main', host: 'one.test', port: 25565, version: '', fakeHost: '' });
  await store.saveServer({ originalName: 'Main', name: 'Primary', host: 'two.test', port: 25566, version: '1.21.11', fakeHost: '' });
  assert.deepEqual(await store.getServers(), [{ name: 'Primary', host: 'two.test', port: 25566, version: '1.21.11', fakeHost: '' }]);
  await assert.rejects(store.saveServer({ name: 'primary', host: 'three.test', port: 25565 }), /already saved/u);
  assert.equal(await store.removeServer('PRIMARY'), true);
  assert.deepEqual(await store.getServers(), []);
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

test('persists validated automation workflows', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mineprompt-workflows-'));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'data.json');
  const store = await new Store(file).init();
  const workflow = await store.saveWorkflow({
    id: 'patrol',
    name: 'Patrol',
    repeat: 2,
    resources: ['movement'],
    steps: [{ id: 'pause', type: 'wait', durationMs: 100 }]
  });
  assert.equal(workflow.description, '');
  await store.close();
  const restored = await new Store(file).init();
  assert.deepEqual(restored.snapshot().workflows, [workflow]);
  assert.equal(await restored.removeWorkflow('patrol'), true);
});

test('persists, selects, edits, and removes mining policies', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mineprompt-mining-policies-'));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'data.json');
  const store = await new Store(file).init();
  const preset = await store.saveMiningPreset({ name: 'Safe Quarry', policy: { minimumDurability: 25 } });
  assert.equal(store.snapshot().activeMiningPresetId, preset.id);
  const edited = await store.saveMiningPreset({ id: preset.id, name: 'Careful Quarry', policy: { minimumDurability: 40 } });
  assert.equal(edited.policy.minimumDurability, 40);
  await store.selectMiningPreset(null);
  assert.equal(store.snapshot().activeMiningPresetId, null);
  await store.selectMiningPreset(preset.id);
  await store.close();
  const restored = await new Store(file).init();
  assert.equal(restored.snapshot().miningPresets[0].name, 'Careful Quarry');
  assert.equal(await restored.removeMiningPreset(preset.id), true);
  assert.equal(restored.snapshot().activeMiningPresetId, null);
});

test('persists storage zones scoped to a server and dimension', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mineprompt-storage-zones-'));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'data.json');
  const store = await new Store(file).init();
  const zone = await store.saveStorageZone({
    name: 'Warehouse',
    server: { host: 'Example.Test', port: 25565 },
    dimension: 'minecraft:overworld',
    from: { x: 10, y: 64, z: 10 },
    to: { x: 1, y: 70, z: 1 }
  });
  assert.equal(zone.id, 'warehouse');
  await store.close();
  const restored = await new Store(file).init();
  assert.deepEqual(await restored.getStorageZones(), [zone]);
  await assert.rejects(restored.saveStorageZone({ ...zone, id: '', name: 'warehouse' }), /already saved/u);
  assert.equal(await restored.removeStorageZone('WAREHOUSE'), true);
  assert.deepEqual(await restored.getStorageZones(), []);
});

test('coordinates transient storage reservations across sessions', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mineprompt-storage-reservations-'));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = await new Store(path.join(directory, 'data.json')).init();
  const entry = { key: 'withdraw:main:1,64,1:stone', count: 48, available: 64 };
  store.reserveStorage({ owner: 'bot-a', entries: [entry] });
  assert.throws(() => store.reserveStorage({ owner: 'bot-b', entries: [{ ...entry, count: 17 }] }), /only 16 available/u);
  assert.equal(store.releaseStorageOwner('bot-a'), 1);
  const lease = store.reserveStorage({ owner: 'bot-b', entries: [{ ...entry, count: 64 }] });
  assert.equal(store.storageReservationSnapshot().reservations[0].count, 64);
  assert.equal(store.releaseStorageReservation(lease.id, 'bot-b'), true);
  await store.close();
});

test('persists and removes durable build jobs', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mineprompt-build-jobs-'));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'data.json');
  const store = await new Store(file).init();
  const input = {
    id: '12345678-1234-4123-8123-123456789abc',
    blueprintHash: 'c'.repeat(64),
    blueprintName: 'Workshop',
    server: { host: 'build.test', port: 25565 },
    dimension: 'overworld',
    anchor: { x: 1, y: 64, z: 2 },
    operationCount: 8,
    completedCount: 3
  };
  const saved = await store.saveBuildJob(input);
  await store.close();
  const restored = await new Store(file).init();
  assert.deepEqual(await restored.getBuildJobs(), [saved]);
  const updated = await restored.saveBuildJob({ ...saved, status: 'paused', completedCount: 4 });
  assert.equal(updated.status, 'paused');
  assert.equal((await restored.getBuildJobs()).length, 1);
  assert.equal(await restored.removeBuildJob(saved.id.toUpperCase()), true);
  assert.deepEqual(await restored.getBuildJobs(), []);
});
