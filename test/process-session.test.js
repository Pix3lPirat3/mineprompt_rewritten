'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { ProcessSession } = require('../src/main/process-session');

class FakeProcess extends EventEmitter {
  constructor() {
    super();
    this.pid = 4242;
    globalThis.setImmediate(() => this.emit('spawn'));
  }

  postMessage(message) {
    if (message.type === 'init') {
      globalThis.setImmediate(() => {
        this.emit('message', { type: 'event', channel: 'session-snapshot', payload: {
          id: message.id,
          state: { status: 'disconnected', lastError: null },
          activities: [],
          session: { players: [] },
          commands: []
        } });
        this.emit('message', { type: 'ready' });
      });
    }
    if (message.type === 'request') globalThis.setImmediate(() => this.emit('message', { type: 'response', id: message.id, ok: true, value: { method: message.method } }));
  }

  kill() {
    return true;
  }
}

test('supervises isolated bot process requests and snapshots', async () => {
  const events = [];
  const session = new ProcessSession({
    id: 'bot-one',
    rootPath: 'C:\\application',
    privateCommandsPath: 'C:\\private',
    store: { snapshot: () => ({ settings: {} }) },
    logger: { ingest() {}, error() {} },
    emit: (channel, payload) => events.push({ channel, payload }),
    spawn: () => new FakeProcess()
  });
  await session.ready;
  assert.deepEqual(await session.execute('ping'), { method: 'execute' });
  assert.deepEqual(await session.targetAction({ actionId: 'entity.inspect', entityId: 4 }), { method: 'targetAction' });
  assert.deepEqual(await session.miningAction({ action: 'status' }), { method: 'miningAction' });
  assert.deepEqual(await session.stashAction({ action: 'status' }), { method: 'stashAction' });
  assert.deepEqual(await session.inventoryInspect({ scope: 'inventory', target: 36 }), { method: 'inventoryInspect' });
  assert.deepEqual(await session.debugEvaluate({ code: 'bot.inventory' }), { method: 'debugEvaluate' });
  assert.deepEqual(session.snapshot().process, { isolated: true, pid: 4242, status: 'running' });
  assert.equal(events.some((event) => event.channel === 'session-snapshot'), true);
  session.child.postMessage = () => { throw new Error('IPC closed'); };
  await assert.rejects(session.execute('late'), /IPC closed/u);
  assert.equal(session.pending.size, 0);
  await session.close();
});
