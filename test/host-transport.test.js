'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { HostClient } = require('../src/main/host-client');
const { hostEndpoint, tokenPath } = require('../src/main/host-endpoint');
const { MAX_RUNTIME_MESSAGE_BYTES, consumeMessages, encodeMessage, writeEncodedMessage, writeMessage } = require('../src/main/host-server');

class TestSocket extends EventEmitter {
  constructor() {
    super();
    this.destroyed = false;
    this.writable = true;
    this.writableLength = 0;
    this.output = [];
    this.error = null;
  }

  setEncoding() {}

  write(payload) {
    this.output.push(payload);
    return true;
  }

  destroy(error = null) {
    this.destroyed = true;
    this.error = error;
  }
}

test('frames runtime messages and parses chunked input', () => {
  const socket = new TestSocket();
  const messages = [];
  consumeMessages(socket, (message) => messages.push(message));
  const payload = encodeMessage({ type: 'event', value: 'ready' });
  socket.emit('data', payload.slice(0, 8));
  socket.emit('data', payload.slice(8));
  assert.deepEqual(messages, [{ type: 'event', value: 'ready' }]);
  assert.equal(writeMessage(socket, { ok: true }), true);
  assert.equal(socket.output[0], '{"ok":true}\n');
});

test('disconnects a client before its pending output grows without bound', () => {
  const socket = new TestSocket();
  socket.writableLength = MAX_RUNTIME_MESSAGE_BYTES - 2;
  assert.equal(writeEncodedMessage(socket, '{}\n'), false);
  assert.equal(socket.destroyed, true);
  assert.match(socket.error.message, /pending output limit/u);
});

test('fails host requests immediately when the connection is not writable', async () => {
  const client = new HostClient({ userDataPath: process.cwd(), timeout: 1000 });
  client.token = 'token';
  client.socket = new TestSocket();
  client.socket.writable = false;
  await assert.rejects(client.request('snapshot'), /not writable/u);
  assert.equal(client.pending.size, 0);
});

test('closes a host connection when its initial snapshot fails', async (context) => {
  const dataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'mineprompt-handshake-'));
  const endpoint = hostEndpoint(dataPath);
  const token = 'a'.repeat(64);
  await fs.writeFile(tokenPath(dataPath), `${token}\n`);
  if (process.platform !== 'win32') await fs.unlink(endpoint).catch(() => {});
  const server = net.createServer((socket) => consumeMessages(socket, (message) => {
    writeMessage(socket, { type: 'response', id: message.id, ok: false, error: 'Snapshot unavailable.' });
  }));
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(endpoint, () => { resolve(); });
  });
  context.after(async () => {
    await new Promise((resolve) => { server.close(resolve); });
    if (process.platform !== 'win32') await fs.unlink(endpoint).catch(() => {});
    await fs.rm(dataPath, { recursive: true, force: true });
  });
  const client = new HostClient({ userDataPath: dataPath, timeout: 1000 });
  await assert.rejects(client.open(), /Snapshot unavailable/u);
  assert.equal(client.socket, null);
  assert.equal(client.pending.size, 0);
});
