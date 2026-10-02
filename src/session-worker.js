'use strict';

const crypto = require('node:crypto');
const { RuntimeLogger } = require('./main/logger');
const { BotSession } = require('./main/bot-session');
const { ProcessStore } = require('./main/process-store');
const { SESSION_METHOD_NAMES } = require('./main/transport-methods');

const port = process.parentPort || {
  postMessage: (message) => process.send?.(message),
  on: (event, listener) => process.on(event, (message) => listener({ data: message }))
};
const pendingStore = new Map();
let session = null;
let storeSnapshot = { accounts: [], servers: [], settings: {}, connections: [], workflows: [] };
const allowedMethods = new Set(SESSION_METHOD_NAMES);

function send(message) {
  port.postMessage(message);
}

function storeRequest(method, ...args) {
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    pendingStore.set(id, { resolve, reject });
    try {
      send({ type: 'store-request', id, method, args });
    } catch (error) {
      pendingStore.delete(id);
      reject(error);
    }
  });
}

async function initialize(message) {
  storeSnapshot = message.store;
  const logger = new RuntimeLogger((channel, payload) => send({ type: 'event', channel, payload }), {
    log() {}, info() {}, warn() {}, error() {}, debug() {}
  }).child(message.id);
  session = new BotSession({
    id: message.id,
    rootPath: message.rootPath,
    privateCommandsPath: message.privateCommandsPath,
    store: new ProcessStore({ read: () => storeSnapshot, request: storeRequest }),
    logger,
    emit: (channel, payload) => send({ type: 'event', channel, payload })
  });
  await session.ready;
  send({ type: 'ready' });
}

async function handleRequest(message) {
  try {
    if (!session || !allowedMethods.has(message.method) || typeof session[message.method] !== 'function') throw new Error('Bot process operation is not available.');
    const value = await session[message.method](...(Array.isArray(message.args) ? message.args : []));
    send({ type: 'response', id: message.id, ok: true, value });
    if (message.method === 'close') globalThis.setImmediate(() => process.exit(0));
  } catch (error) {
    send({ type: 'response', id: message.id, ok: false, error: error.message });
  }
}

port.on('message', (event) => {
  const message = event.data;
  if (message?.type === 'init') {
    void initialize(message).catch((error) => send({ type: 'fatal', error: error.stack || error.message }));
  } else if (message?.type === 'request') {
    void handleRequest(message);
  } else if (message?.type === 'store-update') {
    storeSnapshot = message.store;
  } else if (message?.type === 'store-response') {
    const request = pendingStore.get(message.id);
    if (!request) return;
    pendingStore.delete(message.id);
    if (message.ok) request.resolve(message.value);
    else request.reject(new Error(message.error || 'Store operation failed.'));
  }
});
