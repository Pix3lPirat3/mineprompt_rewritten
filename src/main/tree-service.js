'use strict';

const { GoalNear } = require('mineflayer-pathfinder').goals;
const { Vec3 } = require('vec3');
const { distance, key } = require('./mining-planner');
const { navigateGoal, cancelNavigation } = require('./navigation-service');
const { computePath } = require('./path-cost-planner');
const { candidateTreeStances, discoverTree, emptySpace, isTreeLeaf, isTreeLog, planForestRoute, planTreeRoute, solidSupport, treeSpecies } = require('./tree-planner');
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

function estimateTreePath(bot, position, range = 0, timeout = 60) {
  if (typeof bot?.pathfinder?.getPathFromTo !== 'function' || !bot.pathfinder.movements) return { available: false, reachable: true, cost: null, status: 'unavailable' };
  const travel = distance(bot.entity.position, position);
  const radius = Math.max(16, Math.min(96, Math.ceil(travel) + 12));
  try {
    const result = computePath(bot, new GoalNear(position.x, position.y, position.z, range), timeout, radius);
    return {
      available: true,
      reachable: result?.status === 'success',
      cost: Number.isFinite(Number(result?.cost)) ? Number(result.cost) : null,
      status: result?.status || 'unresolved',
      next: result?.path?.[0] ? positionValue(result.path[0]) : null
    };
  } catch {
    return { available: true, reachable: false, cost: null, status: 'error' };
  }
}

function safeStand(bot, target, policy, allowLeafClearance = false) {
  const support = bot.blockAt(vec({ x: target.x, y: target.y - 1, z: target.z }));
  const feet = bot.blockAt(vec(target));
  const head = bot.blockAt(vec({ x: target.x, y: target.y + 1, z: target.z }));
  if (isTreeLeaf(support) && policy.leafSupport !== 'always') return null;
  if (isTreeLog(support) && policy.logSupport !== 'stump') return null;
  const clear = (block) => emptySpace(block) || allowLeafClearance && policy.leafSupport === 'always' && isTreeLeaf(block);
  return solidSupport(support) && clear(feet) && clear(head) ? target : null;
}

function cardinalBridgeTarget(bot, path, policy) {
  return cardinalBridgeRoute(bot, path, policy)?.[0] || null;
}

function movementKey(left, right) {
  return [key(left), key(right)].sort().join('|');
}

function cardinalBridgeRoute(bot, path, policy, blockedMoves = new Set()) {
  if (!path?.next || !bot?.entity?.position || typeof bot.blockAt !== 'function') return null;
  const current = bot.entity.position.floored();
  const target = positionValue(path.next);
  const x = target.x - current.x;
  const y = target.y - current.y;
  const z = target.z - current.z;
  if (![0, 1].includes(y) || Math.abs(x) !== 1 || Math.abs(z) !== 1) return null;
  return localCardinalRoute(bot, target, policy, 4, blockedMoves);
}

function localCardinalRoute(bot, target, policy, radius = 4, blockedMoves = new Set()) {
  const start = bot.entity.position.floored();
  const targetKey = key(target);
  const queue = [{ position: positionValue(start), route: [] }];
  const visited = new Set([key(start)]);
  const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const levels = [0, 1, -1, -2, -3];
  while (queue.length && visited.size <= 384) {
    const entry = queue.shift();
    for (const [x, z] of directions) {
      for (const y of levels) {
        const candidate = { x: entry.position.x + x, y: entry.position.y + y, z: entry.position.z + z };
        if (Math.abs(candidate.x - start.x) > radius || Math.abs(candidate.z - start.z) > radius || Math.abs(candidate.y - start.y) > radius) continue;
        const value = key(candidate);
        if (visited.has(value) || blockedMoves.has(movementKey(entry.position, candidate)) || !safeStand(bot, candidate, policy, true)) continue;
        visited.add(value);
        const route = [...entry.route, candidate];
        if (value === targetKey) return route;
        queue.push({ position: candidate, route });
      }
    }
  }
  return null;
}

function localCardinalStep(bot, target, policy, radius = 4, blockedMoves = new Set()) {
  return localCardinalRoute(bot, target, policy, radius, blockedMoves)?.[0] || null;
}

function nearbyHopTarget(bot, path, policy) {
  if (!path?.next || !bot?.entity?.position || typeof bot.blockAt !== 'function') return null;
  const current = bot.entity.position.floored();
  const target = positionValue(path.next);
  const x = target.x - current.x;
  const y = target.y - current.y;
  const z = target.z - current.z;
  if (y !== 1 || Math.abs(x) + Math.abs(z) !== 1) return null;
  return safeStand(bot, target, policy);
}

async function recoverNearbyHop(bot, origin, timeout = 900) {
  if (typeof bot.look !== 'function' || typeof bot.on !== 'function') return false;
  const center = new Vec3(origin.x + 0.5, bot.entity.position.y + (bot.entity.eyeHeight || 1.62), origin.z + 0.5);
  await bot.look(Math.atan2(-(center.x - bot.entity.position.x), -(center.z - bot.entity.position.z)), 0, true);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (recovered) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      bot.removeListener('physicsTick', inspect);
      bot.clearControlStates?.();
      resolve(recovered);
    };
    const inspect = () => {
      const position = bot.entity.position;
      const floor = position.floored();
      if (floor.x === origin.x && floor.y === origin.y && floor.z === origin.z && Math.abs(position.y - origin.y) < 0.08 && bot.entity.onGround !== false) finish(true);
    };
    const timer = setTimeout(() => finish(false), timeout);
    bot.on('physicsTick', inspect);
    bot.setControlState?.('sprint', false);
    bot.setControlState?.('jump', false);
    bot.setControlState?.('forward', true);
    inspect();
  });
}

async function tryNearbyHop(bot, path, policy, timeout = 2200) {
  const target = nearbyHopTarget(bot, path, policy);
  if (!target || typeof bot.look !== 'function' || typeof bot.on !== 'function') return false;
  const startedAt = Date.now();
  const origin = positionValue(bot.entity.position);
  const center = new Vec3(target.x + 0.5, bot.entity.position.y + (bot.entity.eyeHeight || 1.62), target.z + 0.5);
  await bot.look(Math.atan2(-(center.x - bot.entity.position.x), -(center.z - bot.entity.position.z)), 0, true);
  bot.emit?.('mineprompt:tree-hop', { phase: 'start', target, position: positionValue(bot.entity.position), startedAt });
  const arrived = await new Promise((resolve) => {
    let settled = false;
    let stableTicks = 0;
    const finish = (arrived) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      bot.removeListener('physicsTick', inspect);
      bot.clearControlStates?.();
      resolve(arrived);
    };
    const inspect = () => {
      const position = bot.entity.position;
      const floor = position.floored();
      const velocity = Math.abs(Number(bot.entity.velocity?.y) || 0);
      const stable = floor.x === target.x && floor.y === target.y && floor.z === target.z && Math.abs(position.y - target.y) < 0.08 && velocity < 0.08;
      stableTicks = stable ? stableTicks + 1 : 0;
      if (stableTicks >= 2) finish(true);
    };
    const timer = setTimeout(() => finish(false), timeout);
    bot.on('physicsTick', inspect);
    bot.setControlState?.('sprint', false);
    bot.setControlState?.('forward', true);
    bot.setControlState?.('jump', true);
    inspect();
  });
  const recovered = arrived ? true : await recoverNearbyHop(bot, origin);
  bot.emit?.('mineprompt:tree-hop', {
    phase: 'finish',
    target,
    position: { x: bot.entity.position.x, y: bot.entity.position.y, z: bot.entity.position.z },
    velocity: bot.entity.velocity ? { x: bot.entity.velocity.x, y: bot.entity.velocity.y, z: bot.entity.velocity.z } : null,
    onGround: bot.entity.onGround,
    arrived,
    recovered,
    elapsedMs: Date.now() - startedAt
  });
  return arrived;
}

async function navigateTreeStance(bot, stand, range, policy, timeout = 4000, blockedMoves = new Set()) {
  const goal = new GoalNear(stand.x, stand.y, stand.z, range);
  let travel = 0;
  for (let waypoint = 0; waypoint < 32; waypoint += 1) {
    if (goal.isEnd(bot.entity.position.floored())) return travel;
    const path = estimateTreePath(bot, stand, range);
    if (!path.reachable) throw new Error(`Pathfinder reported ${path.status} for tree stance ${positionText(stand)}.`);
    const before = { x: bot.entity.position.x, y: bot.entity.position.y, z: bot.entity.position.z };
    const current = positionValue(bot.entity.position);
    const directBlocked = path.next && blockedMoves.has(movementKey(current, path.next));
    const bridgeRoute = cardinalBridgeRoute(bot, path, policy, blockedMoves) || (directBlocked ? localCardinalRoute(bot, path.next, policy, 4, blockedMoves) : null);
    if (bridgeRoute) {
      let routeFailed = false;
      for (const bridge of bridgeRoute) {
        const bridgeStart = { x: bot.entity.position.x, y: bot.entity.position.y, z: bot.entity.position.z };
        const bridgePath = { next: bridge };
        try {
          if (nearbyHopTarget(bot, bridgePath, policy)) {
            if (!await tryNearbyHop(bot, bridgePath, policy)) throw new Error(`Controlled hop failed at ${positionText(bridge)}.`);
          } else {
            await navigateGoal(bot, new GoalNear(bridge.x, bridge.y, bridge.z, 0), {
              timeout,
              description: `tree bridge ${positionText(bridge)}`
            });
          }
        } catch {
          blockedMoves.add(movementKey(positionValue(bridgeStart), bridge));
          routeFailed = true;
          break;
        }
        travel += distance(bridgeStart, bot.entity.position);
      }
      if (routeFailed) continue;
      continue;
    }
    if (directBlocked) throw new Error(`No local detour bypassed the blocked edge at ${positionText(path.next)}.`);
    if (nearbyHopTarget(bot, path, policy)) {
      if (!await tryNearbyHop(bot, path, policy)) {
        blockedMoves.add(movementKey(current, path.next));
        continue;
      }
      travel += distance(before, bot.entity.position);
      continue;
    }
    const target = path.next || positionValue(stand);
    const targetRange = path.next ? 0 : range;
    await navigateGoal(bot, new GoalNear(target.x, target.y, target.z, targetRange), {
      timeout,
      description: `tree waypoint ${positionText(target)}`
    });
    travel += distance(before, bot.entity.position);
  }
  throw new Error(`Tree route exceeded 32 waypoints before reaching ${positionText(stand)}.`);
}

function allowLeafAccess(bot, step, policy) {
  const movements = bot?.pathfinder?.movements;
  if (!movements || policy.leafSupport !== 'always') return () => {};
  const previousCanDig = movements.canDig;
  const previousExclusions = movements.exclusionAreasBreak;
  const support = `${step.stand.x},${step.stand.y - 1},${step.stand.z}`;
  movements.canDig = true;
  movements.exclusionAreasBreak = [
    ...(Array.isArray(previousExclusions) ? previousExclusions : []),
    (block) => isTreeLeaf(block) && key(block.position) !== support ? 0 : 100
  ];
  return () => {
    movements.canDig = previousCanDig;
    movements.exclusionAreasBreak = previousExclusions;
  };
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
      replans: 0,
      routesRejected: 0,
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
      await this.fell(tree, policy, state);
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
        continue;
      }
      const visible = this.visibleBlocks([target.position], treeSpecies(candidate), policy)[0];
      if (!visible) continue;
      const diggingStarted = this.now();
      const result = await this.mining.mineOnce(target, policy);
      state.diggingMs = (state.diggingMs || 0) + Math.max(0, this.now() - diggingStarted);
      remaining.delete(key(target.position));
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
      const planningStarted = this.now();
      const plan = planTreeRoute(tree, stands, bot.entity.position);
      state.replans = (state.replans || 0) + 1;
      state.planningMs = (state.planningMs || 0) + Math.max(0, this.now() - planningStarted);
      const step = plan.steps[0];
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

module.exports = { TreeService, allowLeafAccess, cardinalBridgeRoute, cardinalBridgeTarget, estimateTreePath, localCardinalRoute, localCardinalStep, movementKey, navigateTreeStance, nearbyHopTarget, positionText, recoverNearbyHop, tryNearbyHop };
