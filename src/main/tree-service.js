'use strict';

const { Vec3 } = require('vec3');
const { distance, key } = require('./mining-planner');
const { cancelNavigation } = require('./navigation-service');
const { candidateTreeStances, discoverTree, isTreeLeaf, isTreeLog, planForestRoute, planTreeRoute, treeSpecies } = require('./tree-planner');
const { normalizeTreePolicy, treePolicyText } = require('./tree-policy');
const { collectTreeDrops, replantTree } = require('./tree-lifecycle');
const { allowLeafAccess, navigateTreeStance } = require('./tree-navigation');
const { inventoryCounts } = require('./stash-service');

function vec(position) {
  return new Vec3(position.x, position.y, position.z);
}

function positionValue(position) {
  return { x: Math.floor(position.x), y: Math.floor(position.y), z: Math.floor(position.z) };
}

function positionText(position) {
  return `${Math.floor(position.x)}, ${Math.floor(position.y)}, ${Math.floor(position.z)}`;
}

function title(value) {
  return String(value || '').split('_').map((part) => part ? part[0].toUpperCase() + part.slice(1) : '').join(' ');
}

class TreeService {
  constructor({ getClient, activities, mining, logger, onChange = () => {}, now = Date.now, collectDrops = collectTreeDrops, replant = replantTree }) {
    this.getClient = getClient;
    this.activities = activities;
    this.mining = mining;
    this.logger = logger;
    this.onChange = onChange;
    this.now = now;
    this.collectDrops = collectDrops;
    this.replant = replant;
    this.lastRun = null;
  }

  get bot() {
    return this.getClient()?.bot || null;
  }

  reader(bot = this.bot) {
    return (position) => bot.blockAt(vec(position));
  }

  findTarget(request = {}, policyInput = {}) {
    const bot = this.bot;
    if (!bot?.entity) throw new Error('An active connection is required.');
    const policy = normalizeTreePolicy(policyInput);
    if (request.position) {
      const block = bot.blockAt(vec(positionValue(request.position)));
      if (!block || !isTreeLog(block) && !isTreeLeaf(block)) throw new Error('The selected position is not part of a supported tree.');
      return block;
    }
    if (request.target !== 'nearest') {
      const block = bot.blockAtCursor?.(32);
      if (block && (isTreeLog(block) || isTreeLeaf(block))) return block;
      if (request.target === 'cursor') throw new Error('Look at a supported tree log or leaf block first.');
    }
    const block = bot.findBlock?.({
      matching: (candidate) => isTreeLog(candidate),
      maxDistance: policy.radius,
      useExtraInfo: true
    });
    if (!block) throw new Error(`No supported tree was found within ${policy.radius} blocks.`);
    return block;
  }

  analyze(origin, policyInput = {}) {
    const bot = this.bot;
    const policy = normalizeTreePolicy(policyInput);
    const tree = discoverTree(this.reader(bot), origin, { maximumLogs: policy.maxBlocks });
    const stands = candidateTreeStances(this.reader(bot), tree, bot.entity.position, {
      reach: policy.reach,
      leafSupport: policy.leafSupport,
      logSupport: policy.logSupport === 'stump'
    });
    const plan = planTreeRoute(tree, stands, bot.entity.position);
    return { tree, plan, policy, stands: stands.length };
  }

  inspect(request = {}) {
    const policy = normalizeTreePolicy(request.policy || request);
    const target = this.findTarget(request, policy);
    const analysis = this.analyze(target.position, policy);
    return {
      ...analysis,
      message: `[Tree] ${title(analysis.tree.species)} at ${positionText(analysis.tree.origin)}\nLogs: ${analysis.tree.logs.length}\nHeight: ${analysis.tree.height}\nNatural confidence: ${Math.round(analysis.tree.confidence * 100)}%\nPlanned: ${analysis.plan.covered}/${analysis.plan.total} logs from ${analysis.plan.steps.length} stands\nPolicy: ${treePolicyText(policy)}`
    };
  }

  scanForest(policyInput = {}) {
    const bot = this.bot;
    const policy = normalizeTreePolicy(policyInput);
    const positions = bot.findBlocks?.({
      matching: (block) => isTreeLog(block),
      maxDistance: policy.radius,
      count: Math.min(4096, policy.maxTrees * 96),
      useExtraInfo: true
    }) || [];
    const seen = new Set();
    const trees = [];
    for (const position of positions) {
      if (seen.has(key(position))) continue;
      let tree;
      try { tree = discoverTree(this.reader(bot), position, { maximumLogs: policy.maxBlocks }); } catch { continue; }
      for (const log of tree.logs) seen.add(key(log));
      if (policy.requireNatural && !tree.natural) continue;
      trees.push(tree);
      if (trees.length >= policy.maxTrees) break;
    }
    return planForestRoute(trees, bot.entity.position).route;
  }

  start(request = {}) {
    const bot = this.bot;
    if (!bot?.entity) throw new Error('An active connection is required.');
    if (this.activities.has('treefarm')) throw new Error('Tree farming is already running.');
    const policy = normalizeTreePolicy(request.policy || request);
    const mode = request.mode === 'farm' ? 'farm' : 'fell';
    const trees = mode === 'farm' ? this.scanForest(policy) : [this.analyze(this.findTarget(request, policy).position, policy).tree];
    if (!trees.length) throw new Error(`No ${policy.requireNatural ? 'natural ' : ''}trees were found within ${policy.radius} blocks.`);
    const uncertain = trees.find((tree) => policy.requireNatural && !tree.natural);
    if (uncertain) throw new Error(`The ${title(uncertain.species)} tree at ${positionText(uncertain.origin)} could not be identified confidently. Use --allow-uncertain to override this protection.`);
    const state = {
      mode,
      phase: 'planning',
      running: true,
      treesFound: trees.length,
      treesFinished: 0,
      treesFailed: 0,
      failures: [],
      logsMined: 0,
      logsSkipped: 0,
      itemsCollected: 0,
      dropsSkipped: 0,
      saplingsPlanted: 0,
      replantSkipped: 0,
      failed: null,
      currentTree: null,
      replans: 0,
      routesRejected: 0,
      remainingLogs: 0,
      candidateStands: 0,
      plannedSteps: 0,
      blockedStands: 0,
      blockedMoves: 0,
      currentStand: null,
      lastRouteFailure: null,
      planningMs: 0,
      diggingMs: 0,
      travelDistance: 0,
      startedAt: this.now(),
      updatedAt: this.now()
    };
    const stop = () => {
      state.running = false;
      state.phase = 'stopping';
      cancelNavigation(bot);
      if (bot.targetDigBlock) void bot.stopDigging().catch(() => {});
    };
    this.lastRun = { state, policy };
    this.activities.register('treefarm', {
      label: mode === 'farm' ? 'Tree farm' : 'Fell tree',
      detail: `${trees.length} ${trees.length === 1 ? 'tree' : 'trees'} planned; ${treePolicyText(policy)}`,
      resources: ['movement', 'world', 'inventory'],
      stop
    });
    void this.run(trees, policy, state).catch((error) => {
      if (state.running) {
        state.failed = error.message;
        this.logger.warn(`[Tree] ${error.message}`);
      }
    }).finally(() => {
      state.running = false;
      state.phase = state.failed ? 'failed' : 'finished';
      state.updatedAt = this.now();
      this.activities.finish('treefarm');
      this.onChange();
    });
    this.onChange();
    return this.status();
  }

  async run(trees, policy, state) {
    for (const tree of trees) {
      if (!state.running) return;
      state.currentTree = { species: tree.species, origin: tree.origin, logs: tree.logs.length };
      state.phase = 'felling';
      this.report(state, true);
      const inventoryBefore = inventoryCounts(this.bot);
      const logsBefore = state.logsMined;
      try {
        await this.fell(tree, policy, state);
      } catch (error) {
        if (policy.onFailure !== 'skip') throw error;
        state.treesFailed += 1;
        state.failures.push({ species: tree.species, origin: tree.origin, reason: error.message });
        if (state.failures.length > 16) state.failures.shift();
        state.remainingLogs = 0;
        state.currentStand = null;
        this.logger.warn(`[Tree] Skipping ${title(tree.species)} at ${positionText(tree.origin)}: ${error.message}`);
        this.report(state, true, `Skipped ${title(tree.species)} at ${positionText(tree.origin)}: ${error.message}`);
        continue;
      }
      if (!state.running) return;
      state.phase = 'collecting';
      const collection = await this.collectDrops(this.bot, tree, policy, inventoryBefore, (detail) => this.report(state, true, detail), state.logsMined - logsBefore);
      state.itemsCollected += collection.collected;
      state.dropsSkipped += collection.skipped;
      if (!state.running) return;
      state.phase = 'replanting';
      const replant = await this.replant(this.bot, tree, policy, (detail) => this.report(state, true, detail));
      state.saplingsPlanted += replant.planted;
      state.replantSkipped += replant.skipped;
      state.treesFinished += 1;
      this.report(state, true);
    }
    if (state.running) this.logger.log(`[Tree] Finished ${state.treesFinished} ${state.treesFinished === 1 ? 'tree' : 'trees'} with ${state.logsMined} logs mined.`);
  }

  visibleBlocks(positions, species, policy) {
    const bot = this.bot;
    const eye = bot.entity.position.offset(0, bot.entity.eyeHeight || 1.62, 0);
    return positions.map((position) => bot.blockAt(vec(position))).filter((block) =>
      block && treeSpecies(block) === species &&
      eye.distanceTo(block.position.offset(0.5, 0.5, 0.5)) <= policy.reach + 0.15 &&
      (typeof bot.canSeeBlock !== 'function' || bot.canSeeBlock(block)));
  }

  async mineBatch(blocks, policy, state, remaining) {
    let progressed = 0;
    for (const candidate of blocks) {
      if (!state.running) break;
      const target = this.bot.blockAt(candidate.position);
      if (!target || target.name !== candidate.name) {
        remaining.delete(key(candidate.position));
        state.remainingLogs = remaining.size;
        continue;
      }
      const visible = this.visibleBlocks([target.position], treeSpecies(candidate), policy)[0];
      if (!visible) continue;
      const diggingStarted = this.now();
      const result = await this.mining.mineOnce(target, policy);
      state.diggingMs = (state.diggingMs || 0) + Math.max(0, this.now() - diggingStarted);
      remaining.delete(key(target.position));
      state.remainingLogs = remaining.size;
      if (result.skipped) state.logsSkipped += 1;
      else state.logsMined += 1;
      progressed += 1;
      state.updatedAt = this.now();
      this.report(state);
      await new Promise((resolve) => { globalThis.setImmediate(resolve); });
    }
    return progressed;
  }

  async fell(original, policy, state) {
    const bot = this.bot;
    const remaining = new Map(original.logs.map((position) => [key(position), position]));
    const blockedStands = new Set();
    const blockedMoves = new Set();
    let stalled = 0;
    const reject = (step) => {
      blockedStands.add(`${step.stand.x},${step.stand.y},${step.stand.z}`);
      stalled += 1;
    };
    while (state.running && remaining.size) {
      for (const [value, position] of remaining) {
        const block = bot.blockAt(vec(position));
        if (!block || treeSpecies(block) !== original.species) remaining.delete(value);
      }
      if (!remaining.size) {
        state.remainingLogs = 0;
        state.currentStand = null;
        return;
      }
      state.remainingLogs = remaining.size;
      const tree = {
        ...original,
        logs: [...remaining.values()],
        leaves: original.leaves.filter((position) => isTreeLeaf(bot.blockAt(vec(position)), original.species))
      };
      const stands = candidateTreeStances(this.reader(bot), tree, bot.entity.position, {
        reach: policy.reach,
        leafSupport: policy.leafSupport,
        logSupport: policy.logSupport === 'stump'
      }).filter((stand) => !blockedStands.has(stand.key));
      const planningStarted = this.now();
      const plan = planTreeRoute(tree, stands, bot.entity.position);
      state.candidateStands = stands.length;
      state.plannedSteps = plan.steps.length;
      state.blockedStands = blockedStands.size;
      state.blockedMoves = blockedMoves.size;
      state.replans = (state.replans || 0) + 1;
      state.planningMs = (state.planningMs || 0) + Math.max(0, this.now() - planningStarted);
      const step = plan.steps[0];
      state.currentStand = step ? { ...step.stand, kind: step.kind } : null;
      const protectedSupports = new Set(plan.steps.map((entry) => entry.supportKey).filter(Boolean));
      const floor = bot.entity.position.floored().offset(0, -1, 0);
      protectedSupports.add(key(floor));
      const directPositions = [...remaining.values()].filter((position) => !protectedSupports.has(key(position)))
        .sort((left, right) => right.y - left.y || distance(bot.entity.position, left) - distance(bot.entity.position, right));
      const direct = this.visibleBlocks(directPositions, original.species, policy);
      if (direct.length) {
        const progressed = await this.mineBatch(direct, policy, state, remaining);
        if (progressed) {
          stalled = 0;
          if (progressed >= 4) {
            blockedStands.clear();
          }
          continue;
        }
      }
      if (!step) {
        const suffix = policy.leafSupport === 'always' ? '' : ' Try --leaf-support always if the canopy is safe to climb.';
        throw new Error(`${remaining.size} logs remain but no safe reachable stance was found.${suffix}`);
      }
      if (distance(bot.entity.position, step.stand) > 0.8) {
        const goalRange = step.kind === 'ground' ? 1 : 0;
        const restoreMovements = allowLeafAccess(bot, step, policy);
        try {
          state.phase = 'moving';
          this.report(state, true, `Moving to ${positionText(step.stand)}`);
          if (distance(bot.entity.position, step.stand) > Math.max(0.8, goalRange)) {
            try {
              state.travelDistance = (state.travelDistance || 0) + await navigateTreeStance(bot, step.stand, goalRange, policy, 4000, blockedMoves);
            } catch (error) {
              reject(step);
              state.routesRejected = (state.routesRejected || 0) + 1;
              state.lastRouteFailure = error.message;
              state.blockedStands = blockedStands.size;
              state.blockedMoves = blockedMoves.size;
              if (stalled >= Math.min(12, Math.max(4, stands.length))) throw new Error(`No route reached the remaining logs. Last route: ${error.message}`);
              continue;
            }
          }
        } finally {
          restoreMovements();
        }
      }
      state.phase = 'felling';
      const targets = this.visibleBlocks(step.blocks, original.species, policy);
      const progressed = await this.mineBatch(targets, policy, state, remaining);
      if (!progressed) {
        reject(step);
        if (stalled >= Math.min(12, Math.max(4, stands.length))) throw new Error('The remaining logs are geometrically reachable but not visible from a usable stance.');
        continue;
      }
      stalled = 0;
      if (progressed >= 4) {
        blockedStands.clear();
      }
    }
    state.remainingLogs = remaining.size;
    if (!remaining.size) state.currentStand = null;
  }

  report(state, force = false, detail = '') {
    const now = this.now();
    if (!force && now - (state.lastReportAt || 0) < 250) return;
    state.lastReportAt = now;
    const message = detail || `${state.treesFinished}/${state.treesFound} trees; ${state.logsMined} logs mined${state.logsSkipped ? `; ${state.logsSkipped} skipped` : ''}`;
    this.activities.update('treefarm', message);
  }

  stop() {
    return this.activities.stop('treefarm');
  }

  status() {
    if (!this.lastRun) return null;
    return { ...this.lastRun.state, policy: this.lastRun.policy };
  }
}

module.exports = { TreeService };
