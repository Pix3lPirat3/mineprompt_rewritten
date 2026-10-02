'use strict';

const crypto = require('node:crypto');
const { emptyPresentation } = require('../../packages/mineflayer-ui');
const { STORE_METHOD_NAMES } = require('./process-store');
const { SESSION_METHOD_NAMES, installRequestMethods } = require('./transport-methods');

const STORE_METHODS = new Set(STORE_METHOD_NAMES);

function emptySession(id, engine = null) {
  return {
    id,
    engine: engine ? {
      id: engine.id,
      profile: engine.profile,
      name: engine.name,
      edition: engine.edition,
      revision: engine.revision
    } : { id: 'stable', profile: 'stable', name: 'Stable', edition: 'java', revision: null },
    state: {
      status: 'disconnected',
      username: null,
      displayName: null,
      position: null,
      health: 0,
      hunger: 0,
      saturation: 0,
      armor: 0,
      experience: { level: 0, progress: 0, points: 0 },
      effects: [],
      sessionStartedAt: null,
      anonymous: false,
      lastError: null
    },
    activities: [],
    session: {
      connectionId: 0,
      inventoryRevision: 0,
      presentation: emptyPresentation(),
      windowId: null,
      containerOpen: false,
      players: [],
      inventory: [],
      inventorySlots: [],
      inventoryLayout: null,
      container: [],
      containerSlots: [],
      containerLayout: null,
      server: null,
      targets: { cursorBlock: null, cursorEntity: null, entities: [] },
      storage: { active: null, zones: [] }
    },
    commands: [],
    extensions: { apiVersion: null, revision: 0, capabilities: [], actionCount: 0, tasks: { active: [] } },
    diagnostics: { inventory: null },
    process: { isolated: true, pid: null, status: 'starting' }
  };
}

class ProcessSession {
  constructor({ id, rootPath, privateCommandsPath, store, logger, emit, spawn, engine = null }) {
    this.id = String(id);
    this.rootPath = rootPath;
    this.privateCommandsPath = privateCommandsPath;
    this.store = store;
    this.logger = logger;
    this.emit = emit;
    this.spawn = spawn;
    this.engine = engine;
    this.pending = new Map();
    this.cached = emptySession(this.id, engine);
    this.closed = false;
    this.closing = false;
    this.child = null;
    this.cancelStartup = null;
    this.ready = this.start();
    void this.ready.catch(() => {});
  }

  start() {
    this.child = this.spawn(this.id);
    return new Promise((resolve, reject) => {
      let complete = false;
      const startupTimer = setTimeout(() => failed(new Error('Bot process did not start within 15 seconds.')), 15000);
      const failed = (error) => {
        if (complete) return;
        const cause = error instanceof Error ? error : new Error(String(error || 'Bot process failed.'));
        complete = true;
        clearTimeout(startupTimer);
        this.cancelStartup = null;
        this.cached.process.status = 'failed';
        this.cached.state.status = 'failed';
        this.cached.state.lastError = cause.message;
        try { this.child?.kill(); } catch {}
        reject(cause);
      };
      this.cancelStartup = failed;
      this.child.once('spawn', () => {
        if (complete) return;
        this.cached.process = { isolated: true, pid: this.child.pid || null, status: 'running' };
        try {
          this.child.postMessage({
            type: 'init',
            id: this.id,
            rootPath: this.rootPath,
            privateCommandsPath: this.privateCommandsPath,
            store: this.store.snapshot(),
            engine: this.engine
          });
        } catch (error) {
          failed(error);
        }
      });
      this.child.once('error', (error) => failed(error instanceof Error ? error : new Error(String(error || 'Bot process failed.'))));
      this.child.on('message', (message) => {
        this.handleMessage(message);
        if (message?.type === 'ready' && !complete) {
          complete = true;
          clearTimeout(startupTimer);
          this.cancelStartup = null;
          resolve(this);
        }
        if (message?.type === 'fatal') failed(new Error(message.error || 'Bot process failed to start.'));
      });
      this.child.on('exit', (code) => {
        if (!complete) failed(new Error(`Bot process exited during startup with code ${code}.`));
        this.handleExit(code);
      });
    });
  }

  handleMessage(message) {
    if (!message || typeof message !== 'object') return;
    if (message.type === 'response') {
      const request = this.pending.get(message.id);
      if (!request) return;
      this.pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.ok) request.resolve(message.value);
      else request.reject(new Error(message.error || 'Bot process request failed.'));
      return;
    }
    if (message.type === 'store-request') {
      void this.handleStoreRequest(message);
      return;
    }
    if (message.type !== 'event') return;
    if (message.channel === 'session-snapshot') {
      this.cached = { ...message.payload, process: { isolated: true, pid: this.child?.pid || null, status: 'running' } };
      this.emit('session-snapshot', this.snapshot());
      return;
    }
    if (message.channel === 'log') {
      this.logger.ingest({ ...message.payload, sessionId: this.id });
      return;
    }
    this.emit(message.channel, { ...message.payload, sessionId: this.id });
  }

  async handleStoreRequest(message) {
    const response = { type: 'store-response', id: message.id, ok: false };
    try {
      if (!STORE_METHODS.has(message.method) || typeof this.store[message.method] !== 'function') throw new Error('Store operation is not available.');
      response.value = await this.store[message.method](...(Array.isArray(message.args) ? message.args : []));
      response.ok = true;
    } catch (error) {
      response.error = error.message;
    }
    this.child?.postMessage(response);
  }

  handleExit(code) {
    if (this.closed) return;
    if (this.cached.process.status === 'failed') return;
    if (this.closing) {
      for (const request of this.pending.values()) {
        clearTimeout(request.timer);
        request.reject(new Error('The bot process closed.'));
      }
      this.pending.clear();
      return;
    }
    const error = new Error(`Bot process exited unexpectedly with code ${code}.`);
    this.cached.process = { isolated: true, pid: null, status: 'failed' };
    this.cached.state = { ...this.cached.state, status: 'failed', lastError: error.message };
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pending.clear();
    this.logger.error(`[Session] ${error.message}`);
    this.emit('attention', { sessionId: this.id });
    this.emit('session-snapshot', this.snapshot());
  }

  request(method, ...args) {
    if (this.closed) return Promise.reject(new Error('The bot process is closed.'));
    if (this.cached.process.status === 'failed') return Promise.reject(new Error(this.cached.state.lastError || 'The bot process is unavailable.'));
    const id = crypto.randomUUID();
    return this.ready.then(() => new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Bot process timed out while running ${method}.`));
      }, method === 'connect' ? 180000 : 30000);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.child.postMessage({ type: 'request', id, method, args });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    }));
  }

  snapshot() {
    return structuredClone(this.cached);
  }

  commandDescriptors() {
    return structuredClone(this.cached.commands || []);
  }

  updateStore(snapshot) {
    if (!this.child || this.closed || this.closing || this.cached.process.status === 'failed') return;
    try { this.child.postMessage({ type: 'store-update', store: snapshot }); } catch {}
  }

  async close() {
    if (this.closed || this.closing) return;
    this.closing = true;
    if (this.cached.process.status === 'starting') {
      this.cancelStartup?.(new Error('The bot process was closed during startup.'));
      this.closed = true;
      return;
    }
    if (this.cached.process.status !== 'failed') {
      try { await this.request('close'); } catch {}
    }
    this.closed = true;
    this.child?.kill();
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error('The bot process was closed.'));
    }
    this.pending.clear();
  }
}

installRequestMethods(ProcessSession.prototype, SESSION_METHOD_NAMES);

module.exports = { ProcessSession, STORE_METHODS, emptySession };
