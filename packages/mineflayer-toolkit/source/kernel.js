'use strict';

const { EventEmitter } = require('node:events');
const { ActivityManager } = require('../../../src/main/activity-manager');
const { ActionDispatcher } = require('../../../src/main/action-dispatcher');

const API_VERSION = 1;
const RUNTIME = Symbol.for('@mineprompt/mineflayer-toolkit/runtime');

function noop() {}

function logger(value = {}) {
  return Object.freeze({
    debug: typeof value.debug === 'function' ? value.debug.bind(value) : noop,
    error: typeof value.error === 'function' ? value.error.bind(value) : noop,
    info: typeof value.info === 'function' ? value.info.bind(value) : typeof value.log === 'function' ? value.log.bind(value) : noop,
    log: typeof value.log === 'function' ? value.log.bind(value) : noop,
    warn: typeof value.warn === 'function' ? value.warn.bind(value) : noop
  });
}

function reasonText(reason) {
  if (reason instanceof Error) return reason.message;
  return String(reason || 'Task cancelled.');
}

function snapshotValue(value, depth = 0, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'undefined') return null;
  if (typeof value === 'function' || typeof value === 'symbol') return `[${typeof value}]`;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      ...(value.code === undefined ? {} : { code: snapshotValue(value.code, depth + 1, seen) })
    };
  }
  if (depth >= 6) return '[truncated]';
  if (seen.has(value)) return '[circular]';
  seen.add(value);
  try {
    if (Array.isArray(value)) return value.slice(0, 100).map((entry) => snapshotValue(entry, depth + 1, seen));
    const output = {};
    for (const [key, entry] of Object.entries(value).slice(0, 100)) output[key] = snapshotValue(entry, depth + 1, seen);
    return output;
  } finally {
    seen.delete(value);
  }
}

class CapabilityError extends Error {
  constructor(code, message, capability = null) {
    super(message);
    this.name = 'CapabilityError';
    this.code = code;
    this.capability = capability;
  }
}

class TaskHandle extends EventEmitter {
  constructor(manager, definition, executor) {
    super();
    this.manager = manager;
    this.id = definition.id;
    this.label = definition.label || definition.id;
    this.resources = Object.freeze([...new Set((definition.resources || []).map(String).filter(Boolean))]);
    this.controller = new AbortController();
    this.state = {
      id: this.id,
      label: this.label,
      status: 'pending',
      detail: String(definition.detail || ''),
      resources: this.resources,
      startedAt: null,
      finishedAt: null,
      result: null,
      error: null
    };
    this.executor = executor;
    this.result = null;
  }

  snapshot() {
    return snapshotValue({ ...this.state, resources: [...this.resources] });
  }

  update(value) {
    const patch = typeof value === 'string' ? { detail: value } : value && typeof value === 'object' ? value : {};
    if (patch.detail !== undefined) this.state.detail = String(patch.detail || '');
    for (const [key, entry] of Object.entries(patch)) {
      if (!['id', 'resources', 'status', 'startedAt', 'finishedAt', 'error', 'result', 'detail'].includes(key)) this.state[key] = entry;
    }
    this.manager.activities.update(this.id, this.state.detail);
    this.publish();
  }

  abort(reason = 'Task cancelled.') {
    if (this.controller.signal.aborted || ['completed', 'failed', 'cancelled'].includes(this.state.status)) return false;
    this.controller.abort(new Error(reasonText(reason)));
    return true;
  }

  publish() {
    const snapshot = this.snapshot();
    this.emit('progress', snapshot);
    this.manager.publish('task', snapshot);
  }

  async execute(executor) {
    this.state.status = 'running';
    this.state.startedAt = Date.now();
    this.manager.activities.register(this.id, {
      label: this.label,
      detail: this.state.detail,
      resources: this.resources,
      stop: () => this.abort('Task stopped.')
    });
    this.publish();
    try {
      const value = await executor({
        bot: this.manager.bot,
        runtime: this.manager.runtime,
        signal: this.controller.signal,
        update: (next) => this.update(next),
        throwIfAborted: () => this.controller.signal.throwIfAborted()
      });
      if (this.controller.signal.aborted) {
        this.state.status = 'cancelled';
        this.state.error = reasonText(this.controller.signal.reason);
        throw this.controller.signal.reason;
      }
      this.state.status = 'completed';
      this.state.result = value ?? null;
      return value;
    } catch (error) {
      if (this.controller.signal.aborted) {
        this.state.status = 'cancelled';
        this.state.error = reasonText(this.controller.signal.reason || error);
      } else {
        this.state.status = 'failed';
        this.state.error = error instanceof Error ? error.message : String(error);
      }
      throw error;
    } finally {
      this.state.finishedAt = Date.now();
      this.manager.activities.finish(this.id);
      this.manager.finish(this);
      this.publish();
    }
  }

  start() {
    if (!this.result) this.result = this.execute(this.executor);
    return this;
  }
}

class TaskManager {
  constructor({ bot, runtime, activities, publish }) {
    this.bot = bot;
    this.runtime = runtime;
    this.activities = activities;
    this.publish = publish;
    this.active = new Map();
    this.recent = [];
  }

  run(definition, executor) {
    if (!definition?.id || typeof executor !== 'function') throw new TypeError('A task id and executor are required.');
    if (this.active.has(definition.id)) throw new Error(`${definition.id} is already running.`);
    const handle = new TaskHandle(this, definition, executor);
    this.active.set(handle.id, handle);
    return handle.start();
  }

  get(id) {
    return this.active.get(String(id || '')) || null;
  }

  stop(id, reason) {
    const task = this.get(id);
    return task ? task.abort(reason) : false;
  }

  stopAll(reason = 'Runtime closed.') {
    for (const task of this.active.values()) task.abort(reason);
  }

  finish(task) {
    if (this.active.get(task.id) === task) this.active.delete(task.id);
    this.recent.unshift(task.snapshot());
    if (this.recent.length > 64) this.recent.length = 64;
  }

  snapshot() {
    return {
      active: [...this.active.values()].map((task) => task.snapshot()),
      recent: this.recent.map((task) => ({ ...task, resources: [...task.resources] }))
    };
  }
}

function validateBot(bot) {
  if (!bot || typeof bot !== 'object' || typeof bot.on !== 'function') throw new TypeError('A Mineflayer bot is required.');
  return bot;
}

function installRuntime(botInput, options = {}) {
  const bot = validateBot(botInput);
  if (bot[RUNTIME]) {
    if (bot[RUNTIME].apiVersion !== API_VERSION) throw new CapabilityError('runtime-version', `MinePrompt runtime API ${bot[RUNTIME].apiVersion} is not compatible with API ${API_VERSION}.`, 'runtime');
    return bot[RUNTIME];
  }
  const events = new EventEmitter();
  events.setMaxListeners(100);
  const capabilities = new Map();
  const disposers = [];
  const runtimeLogger = logger(options.logger);
  let closed = false;
  let revision = 0;
  let runtime;
  const publish = (type, payload) => {
    revision += 1;
    events.emit(type, payload);
    events.emit('change', { type, payload, revision, snapshot: runtime.snapshot() });
  };
  const activities = options.activities || new ActivityManager();
  const actions = options.actions || new ActionDispatcher({ audit: (event) => publish('action', event) });
  runtime = {
    apiVersion: API_VERSION,
    bot,
    activities,
    actions,
    events,
    logger: runtimeLogger,
    tasks: null,
    get closed() { return closed; },
    get revision() { return revision; },
    has(id) { return capabilities.has(String(id || '')); },
    get(id) { return capabilities.get(String(id || ''))?.api || null; },
    require(id, minimumVersion = 1) {
      const capability = capabilities.get(String(id || ''));
      if (!capability) throw new CapabilityError('missing-capability', `The ${id} capability is not installed.`, id);
      if (capability.version < minimumVersion) throw new CapabilityError('capability-version', `The ${id} capability requires API ${minimumVersion}, but API ${capability.version} is installed.`, id);
      return capability.api;
    },
    register(id, api, metadata = {}) {
      const name = String(id || '').trim();
      if (!name || !api || typeof api !== 'object') throw new TypeError('A capability id and API object are required.');
      const existing = capabilities.get(name);
      if (existing?.api === api) return () => false;
      if (existing) throw new CapabilityError('duplicate-capability', `The ${name} capability is already installed.`, name);
      const record = Object.freeze({ id: name, version: Math.max(1, Number(metadata.version) || 1), api, description: String(metadata.description || '') });
      capabilities.set(name, record);
      runtime[name] = api;
      publish('capability', { operation: 'installed', id: name, version: record.version });
      let removed = false;
      return () => {
        if (removed || capabilities.get(name) !== record) return false;
        removed = true;
        capabilities.delete(name);
        delete runtime[name];
        publish('capability', { operation: 'removed', id: name, version: record.version });
        return true;
      };
    },
    addDisposer(disposer) {
      if (typeof disposer !== 'function') throw new TypeError('A disposer must be a function.');
      disposers.push(disposer);
      return disposer;
    },
    subscribe(listener, emitInitial = true) {
      if (typeof listener !== 'function') throw new TypeError('A runtime subscriber must be a function.');
      events.on('change', listener);
      if (emitInitial) listener({ type: 'snapshot', payload: null, revision, snapshot: runtime.snapshot() });
      return () => events.removeListener('change', listener);
    },
    snapshot() {
      return {
        apiVersion: API_VERSION,
        revision,
        closed,
        capabilities: [...capabilities.values()].map(({ api, ...entry }) => ({ ...entry })),
        actions: actions.list(),
        activities: activities.snapshot(),
        tasks: runtime.tasks?.snapshot() || { active: [], recent: [] }
      };
    },
    close() {
      if (closed) return false;
      closed = true;
      runtime.tasks.stopAll();
      activities.stopAll();
      for (const dispose of disposers.splice(0).reverse()) {
        try { dispose(); } catch (error) { runtimeLogger.warn(error instanceof Error ? error.message : String(error)); }
      }
      capabilities.clear();
      events.emit('close');
      events.removeAllListeners();
      delete bot[RUNTIME];
      if (bot.mineprompt === runtime) delete bot.mineprompt;
      return true;
    }
  };
  runtime.tasks = new TaskManager({ bot, runtime, activities, publish });
  const unsubscribeActivities = typeof activities.subscribe === 'function'
    ? activities.subscribe((snapshot, activityRevision) => publish('activities', { revision: activityRevision, activities: snapshot }), false)
    : noop;
  runtime.addDisposer(unsubscribeActivities);
  const close = () => runtime.close();
  bot.once('end', close);
  runtime.addDisposer(() => bot.removeListener('end', close));
  Object.defineProperty(bot, RUNTIME, { configurable: true, value: runtime });
  Object.defineProperty(bot, 'mineprompt', { configurable: true, enumerable: false, value: runtime });
  publish('runtime', { operation: 'installed', apiVersion: API_VERSION });
  return runtime;
}

function runtimePlugin(options = {}) {
  return (bot) => installRuntime(bot, options);
}

function getRuntime(bot) {
  return bot?.[RUNTIME] || bot?.mineprompt || null;
}

module.exports = { API_VERSION, CapabilityError, RUNTIME, TaskHandle, TaskManager, getRuntime, installRuntime, logger, runtimePlugin, snapshotValue };
