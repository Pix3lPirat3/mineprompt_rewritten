'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Vec3 } = require('vec3');
const { ActivityManager } = require('../src/main/activity-manager');
const { BuildExecutor, inventoryVariantSnapshot, itemAdditionalCapacity, pendingItemDemand, requiredItems, surplusInventory } = require('../src/main/build-executor');
const { createBuildJob } = require('../src/main/build-job');
const { normalizeBuildPolicy } = require('../src/main/build-policy');
const { blockStateFromWorld } = require('../src/main/world-diff');

function key(position) {
  return `${position.x},${position.y},${position.z}`;
}

function block(name, position, properties = {}) {
  return {
    name,
    type: name === 'air' ? 0 : 1,
    stateId: name === 'air' ? 0 : 1,
    diggable: name !== 'bedrock',
    position: new Vec3(position.x, position.y, position.z),
    getProperties: () => ({ ...properties })
  };
}

function harness(options = {}) {
  const blocks = new Map();
  blocks.set('0,63,0', block('stone', { x: 0, y: 63, z: 0 }));
  blocks.set('1,63,0', block('stone', { x: 1, y: 63, z: 0 }));
  const target = { x: 1, y: 64, z: 0 };
  let itemCount = options.itemCount ?? 2;
  const expectedState = options.expectedState || 'minecraft:stone';
  const itemName = options.itemName || 'stone';
  const lookCalls = [];
  const placementCalls = [];
  let deferredExtras = [];
  const bot = {
    entity: { position: new Vec3(0, 64, 0), dimension: 'overworld' },
    game: { dimension: 'overworld' },
    lastOptions: { host: 'build.test', port: 25565 },
    controlState: {},
    inventory: { items: () => itemCount > 0 ? [{ name: itemName, count: itemCount, slot: 36 }] : [] },
    pathfinder: {
      bestHarvestTool: () => null,
      async goto(goal) { bot.entity.position = new Vec3(goal.x, goal.y, goal.z); }
    },
    blockAt(position) {
      return blocks.get(key(position)) || (position.y === 63 ? block('stone', position) : block('air', position));
    },
    async equip() {},
    async look(yaw, pitch, force) { lookCalls.push({ yaw, pitch, force }); },
    async waitForTicks(ticks) {
      lookCalls.push({ ticks });
      for (const extra of deferredExtras) blocks.set(key(extra.position), block(extra.name, extra.position, extra.properties));
      deferredExtras = [];
    },
    setControlState(control, value) { this.controlState[control] = value; },
    async _placeBlockWithOptions(reference, face, placementOptions) {
      const position = reference.position.plus(face);
      placementCalls.push({
        reference: { x: reference.position.x, y: reference.position.y, z: reference.position.z },
        face: { x: face.x, y: face.y, z: face.z },
        options: {
          delta: { x: placementOptions.delta.x, y: placementOptions.delta.y, z: placementOptions.delta.z },
          forceLook: placementOptions.forceLook,
          swingArm: placementOptions.swingArm,
          showHand: placementOptions.showHand
        }
      });
      blocks.set(key(position), block(options.placeAs || 'stone', position, options.placeProperties));
      if (options.consumeItems) itemCount = Math.max(0, itemCount - 1);
      if (options.delayPlaceExtras) deferredExtras = options.placeExtras || [];
      else for (const extra of options.placeExtras || []) blocks.set(key(extra.position), block(extra.name, extra.position, extra.properties));
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
    expected: expectedState,
    item: itemName,
    dependencies: [],
    blocked: [],
    instruction: options.instruction || {
      supportPosition: { x: 1, y: 63, z: 0 },
      clickedFace: { x: 0, y: 1, z: 0 },
      cursor: { x: 0.5, y: 1, z: 0.5 },
      mode: 'simple',
      stateProperties: {}
    },
    companions: options.companions
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
  const deposits = [];
  const fetches = [];
  let transfer = null;
  const storage = options.withStorage ? {
    zones: () => [{ id: 'warehouse', name: 'Warehouse' }],
    async startFetch(request) {
      fetches.push(request);
      itemCount += request.count;
      transfer = { kind: 'fetch', count: request.count };
      return { running: true };
    },
    async startDeposit(request) {
      deposits.push(request);
      transfer = { kind: 'deposit', count: request.count };
      return { running: true };
    },
    async waitForTransfer() {
      if (transfer?.kind === 'deposit') itemCount = Math.max(0, itemCount - transfer.count);
      return { settled: true, failed: null, transferred: transfer?.count || 0 };
    },
    stop: () => true
  } : null;
  const executor = new BuildExecutor({
    compile: async () => blockStateFromWorld(blocks.get('1,64,0')) === expectedState
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
  return { activities, blocks, bot, compiled, data, deposits, executor, fetches, lookCalls, operation, placementCalls, target };
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
  const value = harness({ itemCount: 0, materials: 'storage', storageZone: 'warehouse', withStorage: true, consumeItems: true });
  await value.executor.start('test', { anchor: value.target });
  await value.executor.waitForIdle();
  assert.deepEqual(value.fetches, [{ zone: 'warehouse', item: 'stone', count: 1, parentActivity: 'builder' }]);
  assert.deepEqual(value.deposits, []);
  assert.equal(value.data.buildJobs[0].status, 'complete');
});

test('returns only surplus tracked variants after a storage-backed build', async () => {
  const value = harness({ itemCount: 0, materials: 'storage', storageZone: 'warehouse', withStorage: true });
  await value.executor.start('test', { anchor: value.target });
  await value.executor.waitForIdle();
  assert.deepEqual(value.deposits, [{ zone: 'warehouse', slot: 36, count: 1, parentActivity: 'builder' }]);
  assert.equal(value.data.buildJobs[0].status, 'complete');
});

test('fetches one bounded batch for consecutive pending placements', async () => {
  const value = harness({ itemCount: 0, materials: 'storage', storageZone: 'warehouse', withStorage: true, consumeItems: true });
  const operations = [value.operation];
  for (const z of [1, 2]) {
    operations.push({
      ...structuredClone(value.operation),
      id: `place:1,64,${z}`,
      position: { x: 1, y: 64, z },
      instruction: { ...structuredClone(value.operation.instruction), supportPosition: { x: 1, y: 63, z } }
    });
  }
  value.compiled.graph.operations = operations;
  value.compiled.graph.order = operations.map((operation) => operation.id);
  value.compiled.graph.counts.operations = operations.length;
  value.compiled.stances.stances[0].operations = operations.map((operation) => operation.id);
  value.compiled.analysis.counts.placeable = operations.length;
  await value.executor.start('test', { anchor: value.target });
  await value.executor.waitForIdle();
  assert.deepEqual(value.fetches, [{ zone: 'warehouse', item: 'stone', count: 3, parentActivity: 'builder' }]);
  assert.equal(value.data.buildJobs[0].status, 'complete', value.data.buildJobs[0].latestError || 'No build error was recorded.');
  assert.equal(value.blocks.get('1,64,2').name, 'stone');
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

test('counts one item for paired block items but two paired containers', () => {
  const compiled = { graph: { operations: [
    { kind: 'place', item: 'oak_door', groupId: 'vertical:0,64,0' },
    { kind: 'place', item: 'oak_door', groupId: 'vertical:0,64,0' },
    { kind: 'place', item: 'chest', groupId: 'container:2,64,0' },
    { kind: 'place', item: 'chest', groupId: 'container:2,64,0' }
  ] } };
  assert.deepEqual(Object.fromEntries(requiredItems(compiled)), { oak_door: 1, chest: 2 });
});

test('bounds pending material demand and preserves inventory reserve slots', () => {
  const operations = [
    { id: 'door-low', kind: 'place', item: 'oak_door', groupId: 'vertical:0,64,0' },
    { id: 'door-high', kind: 'place', item: 'oak_door', groupId: 'vertical:0,64,0' },
    { id: 'door-two', kind: 'place', item: 'oak_door', groupId: 'vertical:2,64,0' },
    { id: 'stone', kind: 'place', item: 'stone', groupId: null }
  ];
  const compiled = { graph: { operations, order: operations.map((operation) => operation.id) } };
  assert.equal(pendingItemDemand(compiled, 0, 'oak_door'), 2);
  assert.equal(pendingItemDemand(compiled, 2, 'oak_door'), 1);
  const bot = {
    registry: { itemsByName: { oak_door: { stackSize: 64 } } },
    inventory: { items: () => [{ name: 'oak_door', count: 60 }], emptySlotCount: () => 3 }
  };
  assert.equal(itemAdditionalCapacity(bot, 'oak_door'), 68);
});

test('calculates component-exact surplus without including unrelated items', () => {
  let items = [
    { name: 'stone', type: 1, metadata: 0, count: 3, slot: 36 },
    { name: 'dirt', type: 2, metadata: 0, count: 5, slot: 37 }
  ];
  const bot = { inventory: { items: () => items } };
  const allowed = new Set(['stone']);
  const baseline = inventoryVariantSnapshot(bot, allowed);
  items = [
    { name: 'stone', type: 1, metadata: 0, count: 5, slot: 36 },
    { name: 'dirt', type: 2, metadata: 0, count: 12, slot: 37 }
  ];
  assert.deepEqual(surplusInventory(bot, baseline, allowed).map(({ name, count, slot }) => ({ name, count, slot })), [{ name: 'stone', count: 2, slot: 36 }]);
});

test('executes exact axis placement instructions', async () => {
  const value = harness({
    expectedState: 'minecraft:oak_log[axis=x]',
    itemName: 'oak_log',
    placeAs: 'oak_log',
    placeProperties: { axis: 'x' },
    instruction: {
      supportPosition: { x: 2, y: 64, z: 0 },
      clickedFace: { x: -1, y: 0, z: 0 },
      cursor: { x: 0, y: 0.5, z: 0.5 },
      mode: 'axis',
      stateProperties: { axis: 'x' }
    }
  });
  value.blocks.set('2,64,0', block('stone', { x: 2, y: 64, z: 0 }));
  await value.executor.start('test', { anchor: value.target });
  await value.executor.waitForIdle();
  assert.equal(value.data.buildJobs[0].status, 'complete', value.data.buildJobs[0].latestError || 'No build error was recorded.');
  assert.deepEqual(value.placementCalls, [{
    reference: { x: 2, y: 64, z: 0 },
    face: { x: -1, y: 0, z: 0 },
    options: { delta: { x: 0, y: 0.5, z: 0.5 }, forceLook: true, swingArm: 'right', showHand: true }
  }]);
});

test('executes exact top slab placement instructions', async () => {
  const value = harness({
    expectedState: 'minecraft:stone_slab[type=top,waterlogged=false]',
    itemName: 'stone_slab',
    placeAs: 'stone_slab',
    placeProperties: { type: 'top', waterlogged: false },
    instruction: {
      supportPosition: { x: 1, y: 64, z: -1 },
      clickedFace: { x: 0, y: 0, z: 1 },
      cursor: { x: 0.5, y: 0.75, z: 1 },
      mode: 'slab',
      stateProperties: { type: 'top', waterlogged: 'false' }
    }
  });
  value.blocks.set('1,64,-1', block('stone', { x: 1, y: 64, z: -1 }));
  await value.executor.start('test', { anchor: value.target });
  await value.executor.waitForIdle();
  assert.equal(value.data.buildJobs[0].status, 'complete', value.data.buildJobs[0].latestError || 'No build error was recorded.');
  assert.deepEqual(value.placementCalls, [{
    reference: { x: 1, y: 64, z: -1 },
    face: { x: 0, y: 0, z: 1 },
    options: { delta: { x: 0.5, y: 0.75, z: 1 }, forceLook: true, swingArm: 'right', showHand: true }
  }]);
});

test('executes face-determined wall placement instructions', async () => {
  const value = harness({
    expectedState: 'minecraft:ladder[facing=west,waterlogged=false]',
    itemName: 'ladder',
    placeAs: 'ladder',
    placeProperties: { facing: 'west', waterlogged: false },
    instruction: {
      supportPosition: { x: 2, y: 64, z: 0 },
      clickedFace: { x: -1, y: 0, z: 0 },
      cursor: { x: 0, y: 0.5, z: 0.5 },
      mode: 'wall-attached',
      stateProperties: { facing: 'west', waterlogged: 'false' }
    }
  });
  value.blocks.set('2,64,0', block('stone', { x: 2, y: 64, z: 0 }));
  await value.executor.start('test', { anchor: value.target });
  await value.executor.waitForIdle();
  assert.equal(value.data.buildJobs[0].status, 'complete', value.data.buildJobs[0].latestError || 'No build error was recorded.');
  assert.deepEqual(value.placementCalls, [{
    reference: { x: 2, y: 64, z: 0 },
    face: { x: -1, y: 0, z: 0 },
    options: { delta: { x: 0, y: 0.5, z: 0.5 }, forceLook: true, swingArm: 'right', showHand: true }
  }]);
});

test('executes directional placement after synchronizing the required heading', async () => {
  const value = harness({
    expectedState: 'minecraft:furnace[facing=east,lit=false]',
    itemName: 'furnace',
    placeAs: 'furnace',
    placeProperties: { facing: 'east', lit: false },
    instruction: {
      supportPosition: { x: 1, y: 63, z: 0 },
      clickedFace: { x: 0, y: 1, z: 0 },
      cursor: { x: 0.5, y: 1, z: 0.5 },
      mode: 'directional',
      look: { yaw: Math.PI / 2, pitch: 0 },
      stateProperties: { facing: 'east', lit: 'false' }
    }
  });
  await value.executor.start('test', { anchor: value.target });
  await value.executor.waitForIdle();
  assert.equal(value.data.buildJobs[0].status, 'complete', value.data.buildJobs[0].latestError || 'No build error was recorded.');
  assert.deepEqual(value.lookCalls, [{ yaw: Math.PI / 2, pitch: 0, force: true }, { ticks: 1 }]);
  assert.deepEqual(value.placementCalls[0].options, {
    delta: { x: 0.5, y: 1, z: 0.5 },
    forceLook: 'ignore',
    swingArm: 'right',
    showHand: true
  });
});

test('verifies every generated block from one multi-block placement', async () => {
  const upper = { x: 1, y: 65, z: 0 };
  const lowerState = 'minecraft:oak_door[facing=north,half=lower,hinge=right,open=false,powered=false]';
  const upperState = 'minecraft:oak_door[facing=north,half=upper,hinge=right,open=false,powered=false]';
  const value = harness({
    expectedState: lowerState,
    itemName: 'oak_door',
    placeAs: 'oak_door',
    placeProperties: { facing: 'north', half: 'lower', hinge: 'right', open: false, powered: false },
    delayPlaceExtras: true,
    placeExtras: [{ position: upper, name: 'oak_door', properties: { facing: 'north', half: 'upper', hinge: 'right', open: false, powered: false } }],
    companions: [{ position: { x: 1, y: 64, z: 0 }, expected: lowerState }, { position: upper, expected: upperState }],
    instruction: {
      supportPosition: { x: 1, y: 63, z: 0 },
      clickedFace: { x: 0, y: 1, z: 0 },
      cursor: { x: 0.8, y: 1, z: 0.5 },
      mode: 'multiblock',
      look: { yaw: 0, pitch: 0 },
      stateProperties: { facing: 'north', half: 'lower', hinge: 'right', open: 'false', powered: 'false' }
    }
  });
  await value.executor.start('test', { anchor: value.target });
  await value.executor.waitForIdle();
  assert.equal(value.data.buildJobs[0].status, 'complete', value.data.buildJobs[0].latestError || 'No build error was recorded.');
  assert.equal(blockStateFromWorld(value.blocks.get('1,65,0')), upperState);
});
