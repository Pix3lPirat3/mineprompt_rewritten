'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ConnectionService, authenticationMode, validateConnection } = require('../src/main/connection-service');

test('validates connection details without command reconstruction', () => {
  assert.equal(authenticationMode('offline'), 'offline');
  assert.deepEqual(validateConnection({ username: 'Alex', host: 'localhost', port: '25565', auth: 'offline' }), {
    username: 'Alex', host: 'localhost', port: 25565, auth: 'offline', version: '', fakeHost: ''
  });
  assert.throws(() => validateConnection({ username: 'Alex', host: 'https://localhost' }), /hostname/u);
  assert.throws(() => validateConnection({ username: 'Alex', host: 'localhost:25565' }), /without a protocol or port/u);
});

test('stores structured details and reconnects through one service', async () => {
  const opened = [];
  const stored = [];
  const client = { bot: null, startClient: async (options) => opened.push(options) };
  const store = {
    addConnection: async (details) => stored.push(details),
    getConnection: async () => stored.at(-1)
  };
  const service = new ConnectionService({ client, store, logger: { log() {} } });
  await service.connect({ username: 'Alex', host: 'localhost', auth: 'offline' });
  await service.reconnect();
  assert.equal(stored.length, 2);
  assert.equal(opened.length, 2);
  assert.equal(opened[0].host, 'localhost');
  assert.equal(opened[0].auth, 'offline');
  assert.equal(opened[0].profilesFolder.includes('ALEX-'), true);
});
