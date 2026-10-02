'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ProcessStore, STORE_METHOD_NAMES } = require('../src/main/process-store');

test('serves mirrored reads locally and proxies writes', async () => {
  const source = {
    accounts: [{ username: 'Alex', authentication: false }],
    servers: [{ name: 'Local' }],
    settings: { resourcePackPolicy: 'accept' },
    connections: [{ host: 'localhost' }],
    storageZones: [{ id: 'main' }],
    buildJobs: [{ id: 'job' }]
  };
  const requests = [];
  const store = new ProcessStore({
    read: () => source,
    request: async (...args) => { requests.push(args); return 'saved'; }
  });
  assert.equal((await store.getConnection()).host, 'localhost');
  assert.equal((await store.getAccount('alex')).username, 'Alex');
  assert.equal((await store.getAccounts()).length, 1);
  assert.equal((await store.getServers())[0].name, 'Local');
  assert.equal(await store.getSetting('resourcePackPolicy'), 'accept');
  assert.equal((await store.getStorageZones())[0].id, 'main');
  assert.equal((await store.getBuildJobs())[0].id, 'job');
  const snapshot = store.snapshot();
  snapshot.accounts[0].username = 'Changed';
  assert.equal(source.accounts[0].username, 'Alex');
  assert.equal(await store.setSetting('resourcePackPolicy', 'deny'), 'saved');
  assert.deepEqual(requests, [['setSetting', 'resourcePackPolicy', 'deny']]);
  assert.equal(STORE_METHOD_NAMES.every((method) => typeof store[method] === 'function'), true);
});
