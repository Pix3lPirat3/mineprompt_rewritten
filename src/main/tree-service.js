'use strict';

const { GoalNear } = require('mineflayer-pathfinder').goals;
const { Vec3 } = require('vec3');
const { distance, key } = require('./mining-planner');
const { navigateGoal, cancelNavigation } = require('./navigation-service');
const { candidateTreeStances, discoverTree, isTreeLeaf, isTreeLog, planForestRoute, planTreeRoute, treeSpecies } = require('./tree-planner');
const { normalizeTreePolicy, treePolicyText } = require('./tree-policy');

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
  constructor({ getClient, activities, mining, logger, onChange = () => {}, now = Date.now }) {
    this.getClient = getClient;
    this.activities = activities;
    this.mining = mining;
    this.logger = logger;
    this.onChange = onChange;
    this.now = now;
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
      logsMined: 0,
      logsSkipped: 0,
      failed: null,
      currentTree: null,
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
      await this.fell(tree, policy, state);
      state.treesFinished += 1;
      this.report(state, true);
    }
    if (state.running) this.logger.log(`[Tree] Finished ${state.treesFinished} ${state.treesFinished === 1 ? 'tree' : 'trees'} with ${state.logsMined} logs mined.`);
  }

  async fell(original, policy, state) {
    const bot = this.bot;
    const remaining = new Map(original.logs.map((position) => [key(position), position]));
    const blockedStands = new Set();
    let stalled = 0;
    while (state.running && remaining.size) {
      for (const [value, position] of remaining) {
        const block = bot.blockAt(vec(position));
        if (!block || treeSpecies(block) !== original.species) remaining.delete(value);
      }
      if (!remaining.size) return;
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
      const plan = planTreeRoute(tree, stands, bot.entity.position);
      const step = plan.steps[0];
      if (!step) {
        const suffix = policy.leafSupport === 'always' ? '' : ' Try --leaf-support always if the canopy is safe to climb.';
        throw new Error(`${remaining.size} logs remain but no safe reachable stance was found.${suffix}`);
      }
      if (distance(bot.entity.position, step.stand) > 0.8) {
        state.phase = 'moving';
        this.report(state, true, `Moving to ${positionText(step.stand)}`);
        try {
          await navigateGoal(bot, new GoalNear(step.stand.x, step.stand.y, step.stand.z, 0), { timeout: 30000, description: `tree stance ${positionText(step.stand)}` });
        } catch (error) {
          blockedStands.add(`${step.stand.x},${step.stand.y},${step.stand.z}`);
          stalled += 1;
          if (stalled >= Math.min(8, Math.max(3, stands.length))) throw new Error(`No route reached the remaining logs. Last route: ${error.message}`);
          continue;
        }
      }
      state.phase = 'felling';
      const eye = bot.entity.position.offset(0, bot.entity.eyeHeight || 1.62, 0);
      const target = step.blocks.map((position) => bot.blockAt(vec(position))).find((block) =>
        block && treeSpecies(block) === original.species &&
        eye.distanceTo(block.position.offset(0.5, 0.5, 0.5)) <= policy.reach + 0.15 &&
        (typeof bot.canSeeBlock !== 'function' || bot.canSeeBlock(block)));
      if (!target) {
        blockedStands.add(`${step.stand.x},${step.stand.y},${step.stand.z}`);
        stalled += 1;
        if (stalled >= Math.min(8, Math.max(3, stands.length))) throw new Error('The remaining logs are geometrically reachable but not visible from a usable stance.');
        continue;
      }
      const result = await this.mining.mineOnce(target, policy);
      remaining.delete(key(target.position));
      if (result.skipped) state.logsSkipped += 1;
      else state.logsMined += 1;
      state.updatedAt = this.now();
      stalled = 0;
      blockedStands.clear();
      this.report(state);
      await new Promise((resolve) => { globalThis.setImmediate(resolve); });
    }
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

module.exports = { TreeService, positionText };
