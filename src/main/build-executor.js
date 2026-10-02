'use strict';

const { GoalNear } = require('mineflayer-pathfinder').goals;
const { Vec3 } = require('vec3');
const { createBuildJob, updateBuildJob } = require('./build-job');
const { isAirState } = require('./blueprint-model');
const { basicStanceSafe, candidateStances, lineOfSight, positionDistance, positionKey } = require('./placement-compiler');
const { cancelNavigation, navigateGoal } = require('./navigation-service');
const { currentStorageContext } = require('./storage-service');
const { blockStateFromWorld, REPLACEABLE_BLOCKS } = require('./world-diff');
const { abortableDelay } = require('./workflow-runtime');

const EXECUTABLE_PLACEMENT_MODES = new Set(['simple', 'gravity', 'scaffold', 'axis', 'slab']);
const BUILD_ACTIVITY_ID = 'builder';

function positionVector(position) {
  return new Vec3(position.x, position.y, position.z);
}

function operationMap(compiled) {
  return new Map(compiled.graph.operations.map((operation) => [operation.id, operation]));
}

function stanceMap(compiled) {
  const result = new Map();
  for (const stance of compiled.stances.stances) {
    for (const id of stance.operations) if (!result.has(id)) result.set(id, stance.position);
  }
  return result;
}

function inventoryCounts(bot) {
  const counts = new Map();
  for (const item of bot.inventory?.items?.() || []) counts.set(item.name, (counts.get(item.name) || 0) + (Number(item.count) || 0));
  return counts;
}

function requiredItems(compiled) {
  const counts = new Map();
  const grouped = new Set();
  for (const operation of compiled.graph.operations) {
    if (!['place', 'scaffold-place'].includes(operation.kind) || !operation.item) continue;
    const singleItemGroup = operation.groupId && (operation.groupId.startsWith('vertical:') || operation.groupId.startsWith('horizontal:'));
    if (singleItemGroup && grouped.has(operation.groupId)) continue;
    if (singleItemGroup) grouped.add(operation.groupId);
    counts.set(operation.item, (counts.get(operation.item) || 0) + 1);
  }
  return counts;
}

function missingItems(bot, compiled) {
  const available = inventoryCounts(bot);
  return [...requiredItems(compiled)].flatMap(([name, count]) => {
    const missing = Math.max(0, count - (available.get(name) || 0));
    return missing ? [{ name, count, available: available.get(name) || 0, missing }] : [];
  });
}

function unsupportedOperations(compiled) {
  return compiled.graph.operations.filter((operation) => {
    if (!['place', 'scaffold-place'].includes(operation.kind)) return false;
    return !operation.instruction?.supportPosition || !EXECUTABLE_PLACEMENT_MODES.has(operation.instruction.mode);
  });
}

function validateCompiled(bot, compiled, request, options = {}) {
  const counts = compiled.analysis.counts;
  const unsafe = ['conflicting', 'temporarilyObstructed', 'unknown', 'unsupported'].filter((key) => counts[key] > 0);
  if (unsafe.length) throw new Error(`The build preview is not executable: ${unsafe.map((key) => `${counts[key]} ${key}`).join(', ')}.`);
  if (compiled.graph.cyclic.length) throw new Error(`The build contains ${compiled.graph.cyclic.length} cyclic operations.`);
  if (compiled.graph.counts.blocked) throw new Error(`The build contains ${compiled.graph.counts.blocked} blocked operations.`);
  if (compiled.stances.uncovered.length) throw new Error(`The build contains ${compiled.stances.uncovered.length} operations without a safe stance.`);
  const unsupported = unsupportedOperations(compiled);
  if (unsupported.length) throw new Error(`The build contains ${unsupported.length} placements that require unsupported exact-state handling.`);
  if (compiled.graph.counts.removals && request.confirmed !== true) throw new Error(`The build requires ${compiled.graph.counts.removals} removals. Repeat with explicit confirmation.`);
  const missing = options.skipMaterials ? [] : missingItems(bot, compiled);
  if (missing.length) throw new Error(`The build is missing ${missing.map((entry) => `${entry.missing} x ${entry.name}`).join(', ')}.`);
}

function liveState(bot, position) {
  return blockStateFromWorld(bot.blockAt(positionVector(position)));
}

function samePosition(left, right) {
  return left.x === right.x && left.y === right.y && left.z === right.z;
}

function resumeScaffoldPlan(bot, compiled, job) {
  const records = new Map((compiled.analysis.records || []).map((record) => [positionKey(record.position), record]));
  const plannedCleanup = new Set(compiled.graph.operations.filter((operation) => operation.kind === 'scaffold-remove').map((operation) => positionKey(operation.position)));
  const operations = [];
  const positions = [];
  const seen = new Set();
  for (const position of job.temporaryScaffolds) {
    const key = positionKey(position);
    if (seen.has(key)) continue;
    seen.add(key);
    const observed = liveState(bot, position);
    if (isAirState(observed || '')) continue;
    const record = records.get(key);
    if (record?.kind === 'correct' && observed === record.expected) continue;
    const block = bot.blockAt(positionVector(position));
    if (!block?.name || !job.policy.scaffolding.includes(block.name)) throw new Error(`Temporary scaffold ${key} changed to ${block?.name || 'an unloaded block'}.`);
    positions.push({ ...position });
    if (plannedCleanup.has(key)) continue;
    operations.push({
      id: `resume-scaffold-remove:${key}`,
      kind: 'scaffold-remove',
      position: { ...position },
      current: observed,
      expected: 'minecraft:air',
      item: null,
      dependencies: [],
      blocked: [],
      instruction: null
    });
  }
  operations.sort((left, right) => right.position.y - left.position.y || left.id.localeCompare(right.id));
  return { operations, positions };
}

function activeConnection(getClient) {
  const client = getClient();
  if (!client?.bot?.entity) throw new Error('An active connection is required for building.');
  return client;
}

function publicStatus(active, jobs) {
  return {
    active: active ? structuredClone(active.job) : null,
    jobs: jobs.map((job) => structuredClone(job))
  };
}

class BuildExecutor {
  constructor({ compile, getClient, store, activities, storage = null, logger, owner = '', onChange = () => {}, now = Date.now }) {
    if (typeof compile !== 'function' || typeof getClient !== 'function') throw new TypeError('Build compilation and client access are required.');
    if (!store || !activities) throw new TypeError('Build persistence and activity management are required.');
    this.compile = compile;
    this.getClient = getClient;
    this.store = store;
    this.activities = activities;
    this.storage = storage;
    this.logger = logger || { warn() {} };
    this.owner = String(owner || 'builder');
    this.onChange = onChange;
    this.now = now;
    this.active = null;
    this.starting = false;
    this.lastRun = null;
  }

  jobs() {
    return (this.store.snapshot().buildJobs || []).filter((job) => !this.owner || !job.owner || job.owner === this.owner);
  }

  status() {
    return publicStatus(this.active, this.jobs());
  }

  async start(reference, request = {}) {
    if (this.starting || this.active || this.activities.has(BUILD_ACTIVITY_ID)) throw new Error('A build is already active.');
    this.starting = true;
    try {
      const client = activeConnection(this.getClient);
      const context = currentStorageContext(client);
      if (!context) throw new Error('The connected server identity is unavailable.');
      const compiled = await this.compile(reference, request);
      validateCompiled(client.bot, compiled, request, { skipMaterials: true });
      await this.prepareMaterials(client.bot, compiled);
      validateCompiled(client.bot, compiled, request);
      return await this.launch(compiled, request, context);
    } finally {
      this.starting = false;
    }
  }

  async resume(id) {
    const job = this.jobs().find((entry) => entry.id === String(id || '').trim().toLowerCase());
    if (!job) throw new Error('The build job was not found.');
    if (job.status === 'complete') throw new Error('The build job is already complete.');
    if (this.starting || this.active || this.activities.has(BUILD_ACTIVITY_ID)) throw new Error('A build is already active.');
    this.starting = true;
    try {
      const client = activeConnection(this.getClient);
      const context = currentStorageContext(client);
      if (!context || context.server.host !== job.server.host || context.server.port !== job.server.port || context.dimension !== job.dimension) throw new Error('The build job belongs to another server or dimension.');
      const request = { anchor: job.anchor, rotation: job.rotation, mirror: job.mirror, policy: job.policy, confirmed: true };
      const compiled = await this.compile(job.blueprintHash, request, { temporaryScaffolds: job.temporaryScaffolds });
      validateCompiled(client.bot, compiled, request, { skipMaterials: true });
      await this.prepareMaterials(client.bot, compiled);
      validateCompiled(client.bot, compiled, request);
      return await this.launch(compiled, request, context, job);
    } finally {
      this.starting = false;
    }
  }

  async prepareMaterials(bot, compiled) {
    const missing = missingItems(bot, compiled);
    if (!missing.length || compiled.analysis.policy.materials === 'inventory') return;
    if (!this.storage || typeof this.storage.startFetch !== 'function' || typeof this.storage.waitForTransfer !== 'function') throw new Error('Storage-backed build materials are not configured.');
    const zones = this.storage.zones();
    const requestedZone = compiled.analysis.policy.storageZone;
    const zone = requestedZone ? zones.find((entry) => entry.id === requestedZone || entry.name.toLowerCase() === requestedZone.toLowerCase()) : zones.length === 1 ? zones[0] : null;
    if (!zone) throw new Error(requestedZone ? `Storage zone ${requestedZone} is not available for this build.` : 'Choose a storage zone when more than one zone is available.');
    for (const entry of missing) {
      await this.storage.startFetch({ zone: zone.id, item: entry.name, count: entry.missing });
      const result = await this.storage.waitForTransfer();
      if (!result?.settled || result.failed || result.transferred < entry.missing) throw new Error(result?.failed || `Storage fetched only ${result?.transferred || 0} of ${entry.missing} required ${entry.name}.`);
    }
  }

  async launch(compiled, request, context, previous = null) {
    const now = this.now();
    const baseCount = previous ? previous.completedCount + previous.skippedCount : 0;
    const recovery = previous ? resumeScaffoldPlan(activeConnection(this.getClient).bot, compiled, previous) : { operations: [], positions: [] };
    let job = previous
      ? updateBuildJob(previous, {
          status: 'running',
          phase: 'starting',
          operationCount: baseCount + recovery.operations.length + compiled.graph.operations.length,
          latestError: null,
          unresolvedSamples: [],
          temporaryScaffolds: recovery.positions,
          metrics: { finishedAt: null, startedAt: previous.metrics.startedAt || now }
        }, now)
      : createBuildJob({
          owner: this.owner,
          blueprintHash: compiled.analysis.blueprint.hash,
          blueprintId: compiled.analysis.blueprint.id,
          blueprintName: compiled.analysis.blueprint.name,
          server: context.server,
          dimension: context.dimension,
          anchor: compiled.analysis.anchor,
          rotation: compiled.analysis.transform.rotation,
          mirror: compiled.analysis.transform.mirror,
          policy: compiled.analysis.policy,
          status: 'running',
          phase: 'starting',
          operationCount: compiled.graph.operations.length,
          metrics: { startedAt: now }
        }, now);
    const controller = new AbortController();
    const state = { desiredStatus: null };
    const active = { job, compiled, cleanupOperations: recovery.operations, controller, state, promise: null };
    const stop = () => {
      state.desiredStatus ||= 'stopped';
      controller.abort(new Error(state.desiredStatus === 'paused' ? 'Build paused.' : 'Build stopped.'));
      const bot = this.getClient()?.bot;
      cancelNavigation(bot);
      if (bot?.targetDigBlock) void bot.stopDigging().catch(() => {});
    };
    this.activities.register(BUILD_ACTIVITY_ID, {
      label: 'Build structure',
      detail: `${job.blueprintName}: 0/${compiled.graph.operations.length} operations`,
      resources: ['movement', 'inventory', 'world'],
      stop
    });
    try {
      job = await this.store.saveBuildJob(job);
      active.job = job;
    } catch (error) {
      this.activities.finish(BUILD_ACTIVITY_ID);
      throw error;
    }
    this.active = active;
    active.promise = this.run(active).catch(async (error) => {
      if (!controller.signal.aborted) {
        const message = error instanceof Error ? error.message : String(error);
        const recorded = active.job.unresolvedSamples.some((sample) => sample.message === message);
        active.job = await this.save(active, {
          status: 'failed',
          phase: 'failed',
          failedCount: active.job.failedCount + (recorded ? 0 : 1),
          latestError: message,
          unresolvedSamples: recorded ? active.job.unresolvedSamples : [...active.job.unresolvedSamples, { operation: 'build:verify', position: active.job.anchor, message }]
        });
        this.logger.warn(`[Build] ${active.job.latestError}`);
      }
    }).finally(async () => {
      const desired = state.desiredStatus;
      if (controller.signal.aborted) {
        active.job = await this.save(active, { status: desired === 'paused' ? 'paused' : 'stopped', phase: desired === 'paused' ? 'paused' : 'stopped', metrics: { finishedAt: this.now() } }).catch(() => active.job);
      }
      this.activities.finish(BUILD_ACTIVITY_ID);
      if (this.active === active) this.active = null;
      this.lastRun = active;
      this.onChange();
    });
    void active.promise;
    this.onChange();
    return structuredClone(job);
  }

  async save(active, patch) {
    const job = updateBuildJob(active.job, patch, this.now());
    active.job = await this.store.saveBuildJob(job);
    this.onChange();
    return active.job;
  }

  async run(active) {
    const { compiled, controller } = active;
    const signal = controller.signal;
    const operations = operationMap(compiled);
    const plannedStances = stanceMap(compiled);
    const outcomes = new Map();
    let batch = 0;
    for (const operation of active.cleanupOperations) {
      signal.throwIfAborted();
      try {
        await this.executeWithRetry(active, operation, null);
        this.completeOperation(active, operation);
        await this.save(active, active.job);
      } catch (error) {
        if (signal.aborted) throw error;
        await this.recordFailure(active, operation, error.message, false);
        throw error;
      }
    }
    for (const id of compiled.graph.order) {
      signal.throwIfAborted();
      const operation = operations.get(id);
      if (!operation) continue;
      const blockedBy = operation.dependencies.find((dependency) => outcomes.get(dependency) === 'failed');
      if (blockedBy) {
        outcomes.set(id, 'failed');
        await this.recordFailure(active, operation, `Dependency ${blockedBy} did not complete.`, true);
        continue;
      }
      try {
        await this.executeWithRetry(active, operation, plannedStances.get(id));
        outcomes.set(id, 'done');
        this.completeOperation(active, operation);
      } catch (error) {
        if (signal.aborted) throw error;
        outcomes.set(id, 'failed');
        await this.recordFailure(active, operation, error.message, compiled.analysis.policy.onFailure === 'skip');
        if (compiled.analysis.policy.onFailure !== 'skip') throw error;
      }
      batch += 1;
      this.activities.update(BUILD_ACTIVITY_ID, `${active.job.blueprintName}: ${active.job.completedCount + active.job.skippedCount}/${active.job.operationCount} operations`);
      if (batch >= compiled.analysis.policy.verifyBatchSize) {
        batch = 0;
        await this.save(active, active.job);
      }
      if (compiled.analysis.policy.placementDelay) await abortableDelay(compiled.analysis.policy.placementDelay, signal);
    }
    signal.throwIfAborted();
    for (const position of active.job.temporaryScaffolds) {
      if (!isAirState(liveState(this.getClient().bot, position) || '')) throw new Error(`Temporary scaffolding remains at ${position.x}, ${position.y}, ${position.z}.`);
    }
    const verification = await this.compile(active.job.blueprintHash, {
      anchor: active.job.anchor,
      rotation: active.job.rotation,
      mirror: active.job.mirror,
      policy: active.job.policy,
      confirmed: true
    });
    const incomplete = ['placeable', 'replaceable', 'conflicting', 'temporarilyObstructed', 'unknown', 'unsupported']
      .map((key) => [key, Number(verification.analysis.counts[key]) || 0])
      .filter(([, count]) => count > 0);
    if (incomplete.length) throw new Error(`Final build verification found ${incomplete.map(([key, count]) => `${count} ${key}`).join(', ')}.`);
    const status = active.job.unresolvedSamples.length ? 'failed' : 'complete';
    await this.save(active, { status, phase: status, metrics: { finishedAt: this.now() } });
  }

  completeOperation(active, operation) {
    active.job = updateBuildJob(active.job, {
      phase: 'building',
      completedCount: active.job.completedCount + 1,
      completedSamples: [...active.job.completedSamples, operation.position],
      temporaryScaffolds: operation.kind === 'scaffold-place'
        ? [...active.job.temporaryScaffolds, operation.position]
        : operation.kind === 'scaffold-remove'
          ? active.job.temporaryScaffolds.filter((position) => !samePosition(position, operation.position))
          : active.job.temporaryScaffolds
    }, this.now());
  }

  async recordFailure(active, operation, message, skipped) {
    active.job = updateBuildJob(active.job, {
      phase: skipped ? 'skipping' : 'failed',
      skippedCount: active.job.skippedCount + (skipped ? 1 : 0),
      failedCount: active.job.failedCount + 1,
      latestError: message,
      unresolvedSamples: [...active.job.unresolvedSamples, { operation: operation.id, position: operation.position, message }]
    }, this.now());
    await this.save(active, active.job);
  }

  async executeWithRetry(active, operation, plannedStance) {
    const retries = active.compiled.analysis.policy.retryLimit;
    let lastError = null;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      active.controller.signal.throwIfAborted();
      active.job = updateBuildJob(active.job, { metrics: { attempts: active.job.metrics.attempts + 1, retries: active.job.metrics.retries + (attempt ? 1 : 0) } }, this.now());
      try {
        await this.executeOperation(active, operation, plannedStance);
        active.job = updateBuildJob(active.job, { metrics: { verified: active.job.metrics.verified + 1 } }, this.now());
        return;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error(`Operation ${operation.id} failed.`);
  }

  async executeOperation(active, operation, plannedStance) {
    const bot = activeConnection(this.getClient).bot;
    const targetState = liveState(bot, operation.position);
    if (operation.kind === 'place' || operation.kind === 'scaffold-place') {
      if (targetState === operation.expected) return;
    } else if (isAirState(targetState || '')) {
      return;
    }
    const stance = await this.reachStance(bot, operation, plannedStance, active.controller.signal);
    if (!basicStanceSafe(bot, stance) || !lineOfSight(bot, stance, operation.position)) throw new Error(`The stance for ${operation.id} became unsafe.`);
    if (operation.kind === 'remove' || operation.kind === 'scaffold-remove') await this.removeBlock(bot, operation);
    else await this.placeBlock(bot, operation);
    const expected = operation.kind === 'remove' || operation.kind === 'scaffold-remove' ? null : operation.expected;
    const observed = liveState(bot, operation.position);
    if (expected ? observed !== expected : !isAirState(observed || '')) throw new Error(`Verification failed for ${operation.id}; observed ${observed || 'an unloaded block'}.`);
  }

  async reachStance(bot, operation, planned, signal) {
    let stance = planned && basicStanceSafe(bot, planned) && lineOfSight(bot, planned, operation.position) ? planned : null;
    if (!stance) stance = candidateStances(bot, operation)[0]?.position || null;
    if (!stance) throw new Error(`No safe live stance is available for ${operation.id}.`);
    const before = { x: bot.entity.position.x, y: bot.entity.position.y, z: bot.entity.position.z };
    if (positionDistance(before, stance) > 0.75) {
      await navigateGoal(bot, new GoalNear(stance.x, stance.y, stance.z, 0), { description: `the build stance at ${stance.x}, ${stance.y}, ${stance.z}` });
      signal.throwIfAborted();
      const after = bot.entity.position;
      const travel = positionDistance(before, after);
      if (this.active) this.active.job = updateBuildJob(this.active.job, { metrics: { travel: this.active.job.metrics.travel + travel } }, this.now());
    }
    return stance;
  }

  async removeBlock(bot, operation) {
    const block = bot.blockAt(positionVector(operation.position));
    if (!block || isAirState(blockStateFromWorld(block) || '')) return;
    const observed = blockStateFromWorld(block);
    if (operation.kind === 'remove' && observed !== operation.current) throw new Error(`Removal target ${positionKey(operation.position)} changed from ${operation.current} to ${observed}.`);
    if (operation.kind === 'scaffold-remove' && !activeScaffoldName(operation, block.name)) throw new Error(`Scaffold cleanup refused to remove ${block.name} at ${operation.position.x}, ${operation.position.y}, ${operation.position.z}.`);
    if (block.diggable === false) throw new Error(`${block.name} is not diggable.`);
    let tool = null;
    try { tool = bot.pathfinder?.bestHarvestTool?.(block) || null; } catch {}
    if (tool) await bot.equip(tool, 'hand');
    await bot.dig(block, true, 'raycast');
  }

  async placeBlock(bot, operation) {
    const current = bot.blockAt(positionVector(operation.position));
    const observed = blockStateFromWorld(current);
    const key = positionKey(operation.position);
    const removal = operation.dependencies.some((dependency) => (dependency.startsWith('remove:') || dependency.startsWith('scaffold-remove:')) && dependency.endsWith(`:${key}`));
    if (!removal && observed !== operation.current) throw new Error(`Placement target ${positionKey(operation.position)} changed from ${operation.current} to ${observed}.`);
    if (!current?.name || !REPLACEABLE_BLOCKS.has(current.name)) throw new Error(`Placement target ${operation.position.x}, ${operation.position.y}, ${operation.position.z} is occupied by ${current?.name || 'an unloaded block'}.`);
    const item = (bot.inventory?.items?.() || []).find((entry) => entry.name === operation.item && Number(entry.count) > 0);
    if (!item) throw new Error(`No ${operation.item} remains in inventory.`);
    const instruction = operation.instruction;
    const reference = bot.blockAt(positionVector(instruction.supportPosition));
    if (!reference?.name || REPLACEABLE_BLOCKS.has(reference.name)) throw new Error(`Placement support for ${operation.id} is unavailable.`);
    if (typeof bot._placeBlockWithOptions !== 'function') throw new Error('Exact block placement is unavailable in this Mineflayer engine.');
    await bot.equip(item, 'hand');
    const previousSneak = Boolean(bot.controlState?.sneak);
    if (!previousSneak) bot.setControlState?.('sneak', true);
    try {
      await bot._placeBlockWithOptions(reference, positionVector(instruction.clickedFace), {
        delta: positionVector(instruction.cursor),
        forceLook: true,
        swingArm: 'right',
        showHand: true
      });
    } finally {
      if (!previousSneak) bot.setControlState?.('sneak', false);
    }
  }

  pause() {
    if (!this.active) return false;
    this.active.state.desiredStatus = 'paused';
    return this.activities.stop(BUILD_ACTIVITY_ID);
  }

  stop() {
    if (!this.active) return this.starting && this.storage ? this.storage.stop() : false;
    this.active.state.desiredStatus = 'stopped';
    return this.activities.stop(BUILD_ACTIVITY_ID);
  }

  async waitForIdle() {
    const promise = this.active?.promise || this.lastRun?.promise;
    if (promise) await promise;
    return this.status();
  }
}

function activeScaffoldName(operation, blockName) {
  const expected = String(operation.current || '').replace(/^minecraft:/u, '').split('[', 1)[0];
  return blockName === expected;
}

module.exports = {
  BUILD_ACTIVITY_ID,
  BuildExecutor,
  EXECUTABLE_PLACEMENT_MODES,
  inventoryCounts,
  missingItems,
  requiredItems,
  unsupportedOperations,
  validateCompiled
};
