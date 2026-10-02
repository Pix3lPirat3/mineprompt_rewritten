'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const {
  API_VERSION,
  CapabilityError,
  installMining,
  installRuntime,
  installToolkit,
  runtimePlugin
} = require('../packages/mineflayer-toolkit');

class FakeBot extends EventEmitter {
  constructor() {
    super();
    this.inventory = new EventEmitter();
    this.inventory.items = () => [];
    this.entities = {};
    this.players = {};
    this.registry = { items: {}, blocksByName: {}, entitiesByName: {} };
    this.entity = { id: 1, position: { x: 0, y: 64, z: 0 } };
  }
}

test('installs an isolated versioned runtime through Mineflayer loadPlugin semantics', () => {
  const left = new FakeBot();
  const right = new FakeBot();
  runtimePlugin()(left);
  runtimePlugin()(right);
  left.mineprompt.register('sample', { value: 7 });
  assert.equal(left.mineprompt.apiVersion, API_VERSION);
  assert.equal(left.mineprompt.require('sample').value, 7);
  assert.equal(right.mineprompt.has('sample'), false);
  assert.throws(() => right.mineprompt.require('sample'), CapabilityError);
  left.emit('end');
  assert.equal(left.mineprompt, undefined);
  assert.equal(right.mineprompt.closed, false);
  right.mineprompt.close();
});

test('contains runtime observer failures and continues event delivery', () => {
  const bot = new FakeBot();
  const warnings = [];
  const runtime = installRuntime(bot, { logger: { warn: (message) => warnings.push(message) } });
  let received = 0;
  runtime.events.on('capability', () => { throw new Error('Listener failed'); });
  runtime.events.on('capability', () => { received += 1; });
  assert.doesNotThrow(() => runtime.register('sample', { ready: true }));
  assert.equal(received, 1);
  assert.deepEqual(warnings, ['Listener failed']);
  runtime.close();
});

test('runs observable resource-owned tasks and retains bounded results', async () => {
  const bot = new FakeBot();
  const runtime = installRuntime(bot);
  const progress = [];
  const task = runtime.tasks.run({ id: 'sample.task', label: 'Sample', resources: ['movement'] }, async ({ update }) => {
    update({ detail: 'Working', completed: 1 });
    return { ok: true };
  });
  task.on('progress', (snapshot) => progress.push(snapshot.status));
  assert.deepEqual(await task.result, { ok: true });
  assert.equal(task.snapshot().status, 'completed');
  assert.equal(runtime.tasks.snapshot().active.length, 0);
  assert.equal(runtime.tasks.snapshot().recent[0].completed, 1);
  assert.equal(runtime.summary().tasks.active.length, 0);
  assert.equal(runtime.summary().actionCount, 0);
  assert.equal(runtime.activities.snapshot().length, 0);
  assert.equal(progress.at(-1), 'completed');
  runtime.close();
});

test('produces bounded serializable task snapshots', async () => {
  const bot = new FakeBot();
  const runtime = installRuntime(bot);
  const result = { count: 2n, callback: () => true };
  result.self = result;
  const task = runtime.tasks.run({ id: 'sample.snapshot' }, async () => result);
  assert.equal(await task.result, result);
  const snapshot = runtime.tasks.snapshot().recent[0];
  assert.equal(snapshot.result.count, '2');
  assert.equal(snapshot.result.callback, '[function]');
  assert.equal(snapshot.result.self, '[circular]');
  assert.doesNotThrow(() => JSON.stringify(runtime.snapshot()));
  runtime.close();
});

test('installs supplied application services as public capabilities and actions', async () => {
  const bot = new FakeBot();
  const miningService = {
    mineOnce: async () => ({ mined: true }),
    startConsistent: () => ({ running: true }),
    startRegion: () => ({ running: true }),
    status: () => ({ running: false })
  };
  const treeService = {
    inspect: (request) => ({ species: 'oak', request }),
    start: (request) => ({ running: true, request }),
    stop: () => true,
    status: () => ({ running: false })
  };
  const storageService = {
    zones: () => [{ id: 'main' }],
    saveZone: async (request) => request,
    removeZone: async () => true,
    start: () => ({ running: true }),
    inspect: () => ({ zone: { id: 'main' } }),
    find: () => [],
    categories: () => [],
    saveCategory: async (zone, request) => ({ zone, ...request }),
    removeCategory: async () => true,
    fetchPlan: async (request) => request,
    startFetch: async (request) => request,
    depositPlan: async (request) => request,
    startDeposit: async (request) => request,
    status: () => null,
    stop: () => true,
    summary: () => ({ active: null, zones: [] })
  };
  const builderService = {
    list: () => [{ id: 'house' }],
    inspect: () => ({ id: 'house' }),
    materials: () => ({ materials: [] }),
    preview: async () => ({ counts: {} }),
    snapshot: () => ({ blueprints: [] })
  };
  const installed = installToolkit(bot, {
    mining: { service: miningService },
    trees: { service: treeService },
    storage: { service: storageService },
    builder: { service: builderService, library: {} },
    inventory: false,
    interactions: false
  });
  assert.equal(installed.mining.service, miningService);
  assert.equal(installed.trees.service, treeService);
  assert.equal(installed.storage.service, storageService);
  assert.equal(installed.builder.service, builderService);
  assert.equal(bot.mineprompt.snapshot().capabilities.some((entry) => entry.id === 'trees'), true);
  const inspected = await bot.mineprompt.actions.execute('trees.inspect', { target: 'nearest' });
  assert.equal(inspected.species, 'oak');
  assert.deepEqual(bot.mineprompt.actions.list().map((action) => action.id).sort(), [
    'builder.inspect',
    'builder.list',
    'builder.materials',
    'builder.preview',
    'mining.once',
    'mining.region',
    'mining.stop',
    'navigation.stop',
    'storage.categories',
    'storage.category-remove',
    'storage.category-save',
    'storage.deposit',
    'storage.fetch',
    'storage.find',
    'storage.inspect',
    'storage.plan-deposit',
    'storage.plan-fetch',
    'storage.remove',
    'storage.save',
    'storage.scan',
    'storage.stop',
    'storage.zones',
    'trees.farm',
    'trees.fell',
    'trees.inspect',
    'trees.stop'
  ]);
  bot.mineprompt.close();
});

test('rolls back partial plugin registration after an action collision', () => {
  const bot = new FakeBot();
  const runtime = installRuntime(bot);
  runtime.actions.register({ id: 'mining.region', execute: () => null });
  assert.throws(() => installMining(bot, {
    service: {
      mineOnce() {},
      startConsistent() {},
      startRegion() {},
      status: () => ({})
    }
  }), /already registered/u);
  assert.equal(runtime.has('mining'), false);
  assert.equal(runtime.actions.get('mining.once'), null);
  assert.equal(runtime.actions.count(), 2);
  runtime.close();
  assert.equal(runtime.actions.count(), 0);
});

test('keeps CommonJS and ESM toolkit exports aligned', async () => {
  const common = require('../packages/mineflayer-toolkit');
  const module = await import('../packages/mineflayer-toolkit/dist/index.js');
  for (const name of ['installRuntime', 'installMining', 'installTrees', 'installInventory', 'installStorage', 'installBuilder', 'installInteractions', 'installToolkit']) {
    assert.equal(typeof common[name], 'function');
    assert.equal(typeof module[name], 'function');
  }
});
