'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Vec3 } = require('vec3');
const { ActivityManager } = require('../src/main/activity-manager');
const { BuildExecutor } = require('../src/main/build-executor');
const { createBuildJob } = require('../src/main/build-job');
const { normalizeBuildPolicy } = require('../src/main/build-policy');

function key(position) {
  return `${position.x},${position.y},${position.z}`;
}

function block(name, position) {
  return {
    name,
    type: name === 'air' ? 0 : 1,
    stateId: name === 'air' ? 0 : 1,
    diggable: name !== 'bedrock',
    position: new Vec3(position.x, position.y, position.z),
    getProperties: () => ({})
  };
}

function harness(options = {}) {
  const blocks = new Map();
  blocks.set('0,63,0', block('stone', { x: 0, y: 63, z: 0 }));
  blocks.set('1,63,0', block('stone', { x: 1, y: 63, z: 0 }));
  const target = { x: 1, y: 64, z: 0 };
  let itemCount = options.itemCount ?? 2;
  const bot = {
    entity: { position: new Vec3(0, 64, 0), dimension: 'overworld' },
    game: { dimension: 'overworld' },
    lastOptions: { host: 'build.test', port: 25565 },
    controlState: {},
    inventory: { items: () => itemCount > 0 ? [{ name: 'stone', count: itemCount, slot: 36 }] : [] },
    pathfinder: { bestHarvestTool: () => null },
    blockAt(position) {
      return blocks.get(key(position)) || (position.y === 63 ? block('stone', position) : block('air', position));
    },
    async equip() {},
    setControlState(control, value) { this.controlState[control] = value; },
    async _placeBlockWithOptions(reference, face) {
      const position = reference.position.plus(face);
      blocks.set(key(position), block(options.placeAs || 'stone', position));
    },
    async dig(value) { blocks.set(key(value.position), block('air', value.position)); },
    clearControlStates() {}
  };
  const policy = normalizeBuildPolicy({ placementDelay: 0, retryLimit: options.retryLimit ?? 0, verifyBatchSize: 1, materials: options.materials, storageZone: options.storageZone });
  const operation = {
    id: 'place:1,64,0',
    kind: 'place',
    position: target,
    current: 'minecraft:air',
    expected: 'minecraft:stone',
    item: 'stone',
    dependencies: [],
    blocked: [],
    instruction: {
      supportPosition: { x: 1, y: 63, z: 0 },
      clickedFace: { x: 0, y: 1, z: 0 },
      cursor: { x: 0.5, y: 1, z: 0.5 },
      mode: 'simple',
      stateProperties: {}
    }
  };
  const compiled = {
    analysis: {
      blueprint: { id: 'a'.repeat(16), hash: 'a'.repeat(64), name: 'Test build' },
      anchor: { x: 1, y: 64, z: 0 },
      transform: { rotation: 0, mirror: 'none' },
      policy,
      counts: { correct: 0, ignoredAir: 0, placeable: 1, replaceable: 0, conflicting: 0, temporarilyObstructed: 0, unknown: 0, unsupported: 0 }
    },
    graph: {
      operations: [operation],
      order: [operation.id],
      cyclic: [],
      counts: { operations: 1, removals: 0, blocked: 0 }
    },
    stances: {
      stances: [{ position: { x: 0, y: 64, z: 0 }, operations: [operation.id] }],
      uncovered: [],
      counts: { blocked: 0 }
    }
  };
  const data = { buildJobs: [] };
  const store = {
    snapshot: () => structuredClone(data),
    async saveBuildJob(job) {
      const index = data.buildJobs.findIndex((entry) => entry.id === job.id);
      if (index >= 0) data.buildJobs[index] = structuredClone(job);
      else data.buildJobs.push(structuredClone(job));
      return structuredClone(job);
    }
  };
  const activities = new ActivityManager();
  const fetches = [];
  const storage = options.withStorage ? {
    zones: () => [{ id: 'warehouse', name: 'Warehouse' }],
    async startFetch(request) {
      fetches.push(request);
      itemCount += request.count;
      return { running: true };
    },
    async waitForTransfer() {
      const requested = fetches.at(-1)?.count || 0;
      return { settled: true, failed: null, transferred: requested };
    },
    stop: () => true
  } : null;
  const executor = new BuildExecutor({
    compile: async () => blocks.get('1,64,0')?.name === 'stone'
      ? {
          analysis: { ...compiled.analysis, counts: { correct: 1, ignoredAir: 0, placeable: 0, replaceable: 0, conflicting: 0, temporarilyObstructed: 0, unknown: 0, unsupported: 0 } },
          graph: { operations: [], order: [], cyclic: [], counts: { operations: 0, removals: 0, blocked: 0 } },
          stances: { stances: [], uncovered: [], counts: { blocked: 0 } }
        }
      : compiled,
    getClient: () => ({ bot }),
    store,
    activities,
    storage,
    owner: 'test'
  });
  return { activities, blocks, bot, compiled, data, executor, fetches, operation, target };
}

test('executes and verifies a survival placement', async () => {
  const value = harness();
  const started = await value.executor.start('test', { anchor: value.target });
  assert.equal(started.status, 'running');
  await value.executor.waitForIdle();
  assert.equal(value.blocks.get('1,64,0').name, 'stone', value.data.buildJobs[0].latestError || 'No build error was recorded.');
  assert.equal(value.data.buildJobs[0].status, 'complete');
  assert.equal(value.data.buildJobs[0].completedCount, 1);
  assert.equal(value.data.buildJobs[0].metrics.verified, 1);
  assert.equal(value.activities.has('builder'), false);
});

test('fails a job when exact state verification does not match', async () => {
  const value = harness({ placeAs: 'dirt' });
  await value.executor.start('test', { anchor: value.target });
  await value.executor.waitForIdle();
  assert.equal(value.data.buildJobs[0].status, 'failed');
  assert.match(value.data.buildJobs[0].latestError, /verification failed/iu);
  assert.equal(value.data.buildJobs[0].unresolvedSamples.length, 1);
  assert.equal(value.data.buildJobs[0].failedCount, 1);
});

test('requires confirmation before executing removals', async () => {
  const value = harness();
  value.compiled.graph.counts.removals = 1;
  await assert.rejects(value.executor.start('test', { anchor: value.target }), /explicit confirmation/u);
  assert.equal(value.data.buildJobs.length, 0);
});

test('fetches missing build materials from one configured storage zone', async () => {
  const value = harness({ itemCount: 0, materials: 'storage', storageZone: 'warehouse', withStorage: true });
  await value.executor.start('test', { anchor: value.target });
  await value.executor.waitForIdle();
  assert.deepEqual(value.fetches, [{ zone: 'warehouse', item: 'stone', count: 1 }]);
  assert.equal(value.data.buildJobs[0].status, 'complete');
});

test('refuses to dig a removal target that changed after planning', async () => {
  const value = harness();
  value.blocks.set('1,64,0', block('granite', value.target));
  value.operation.kind = 'remove';
  value.operation.current = 'minecraft:dirt';
  value.operation.expected = 'minecraft:air';
  value.operation.item = null;
  value.operation.instruction = null;
  value.compiled.analysis.counts.placeable = 0;
  value.compiled.analysis.counts.replaceable = 1;
  value.compiled.graph.counts.removals = 1;
  await value.executor.start('test', { anchor: value.target, confirmed: true });
  await value.executor.waitForIdle();
  assert.equal(value.blocks.get('1,64,0').name, 'granite');
  assert.match(value.data.buildJobs[0].latestError, /changed from minecraft:dirt to minecraft:granite/u);
});

test('resumes by removing an owned scaffold before permanent placement', async () => {
  const value = harness();
  value.blocks.set('1,64,0', block('dirt', value.target));
  const cleanup = {
    id: 'scaffold-remove:1,64,0',
    kind: 'scaffold-remove',
    position: value.target,
    current: 'minecraft:dirt',
    expected: 'minecraft:air',
    item: null,
    dependencies: [],
    blocked: [],
    instruction: null
  };
  value.operation.current = 'minecraft:dirt';
  value.operation.dependencies = [cleanup.id];
  value.compiled.graph.operations = [cleanup, value.operation];
  value.compiled.graph.order = [cleanup.id, value.operation.id];
  value.compiled.graph.counts.operations = 2;
  value.compiled.analysis.records = [{ position: value.target, expected: 'minecraft:stone', kind: 'placeable', temporaryScaffold: true }];
  const job = createBuildJob({
    owner: 'test',
    blueprintHash: 'a'.repeat(64),
    blueprintId: 'a'.repeat(16),
    blueprintName: 'Test build',
    server: { host: 'build.test', port: 25565 },
    dimension: 'overworld',
    anchor: value.target,
    policy: value.compiled.analysis.policy,
    status: 'paused',
    operationCount: 2,
    temporaryScaffolds: [value.target]
  });
  value.data.buildJobs.push(job);
  await value.executor.resume(job.id);
  await value.executor.waitForIdle();
  assert.equal(value.blocks.get('1,64,0').name, 'stone', value.data.buildJobs[0].latestError || 'No build error was recorded.');
  assert.equal(value.data.buildJobs[0].status, 'complete');
  assert.deepEqual(value.data.buildJobs[0].temporaryScaffolds, []);
});
