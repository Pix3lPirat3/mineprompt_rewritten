'use strict';

const { GoalNear } = require('mineflayer-pathfinder').goals;
const { Vec3 } = require('vec3');
const { blockHazard, candidateStands, distance, normalizeRegion, planReachRoute, regionPositions } = require('./mining-planner');
const { normalizeMiningPolicy, policyText, toolDecision } = require('./mining-policy');
const { cancelNavigation, navigateGoal } = require('./navigation-service');
const { selectPathAwareStep } = require('./path-cost-planner');

function vec(position) {
  return new Vec3(position.x, position.y, position.z);
}

function positionText(position) {
  return `${position.x}, ${position.y}, ${position.z}`;
}

function matchesFilter(block, policy) {
  const name = String(block?.name || '').toLowerCase();
  if (policy.include.length && !policy.include.includes(name)) return false;
  return !policy.exclude.includes(name);
}

async function navigate(bot, position, range, timeout = 12000) {
  return navigateGoal(bot, new GoalNear(position.x, position.y, position.z, range), { timeout, description: positionText(position) });
}

function miningDirection(bot, block) {
  const eye = bot.entity.position.offset(0, bot.entity.eyeHeight || bot.entity.height || 1.62, 0);
  const delta = block.position.minus(eye);
  const candidates = [
    { axis: 'x', value: Math.abs(delta.x), sign: Math.sign(delta.x) },
    { axis: 'y', value: Math.abs(delta.y), sign: Math.sign(delta.y) },
    { axis: 'z', value: Math.abs(delta.z), sign: Math.sign(delta.z) }
  ].sort((left, right) => right.value - left.value);
  const direction = { x: 0, y: 0, z: 0 };
  direction[candidates[0].axis] = candidates[0].sign || 1;
  return new Vec3(direction.x, direction.y, direction.z);
}

class MiningBlockError extends Error {
  constructor(block, reason) {
    super(`Mining stopped because ${block.displayName || block.name} is ${reason.replaceAll('-', ' ')}.`);
    this.name = 'MiningBlockError';
    this.reason = reason;
    this.block = block.name;
  }
}

class MiningService {
  constructor({ getClient, activities, logger, onChange = () => {}, schedule = setTimeout, cancelSchedule = clearTimeout, now = Date.now, blockedTimeout = 10000, tickDelay = 100 }) {
    this.getClient = getClient;
    this.activities = activities;
    this.logger = logger;
    this.onChange = onChange;
    this.schedule = schedule;
    this.cancelSchedule = cancelSchedule;
    this.now = now;
    this.blockedTimeout = blockedTimeout;
    this.tickDelay = tickDelay;
    this.lastRegion = null;
    this.consistent = null;
  }

  get bot() {
    return this.getClient()?.bot || null;
  }

  wait(delay) {
    return new Promise((resolve) => { this.schedule(resolve, delay); });
  }

  async equipFor(block, policyInput = {}) {
    const bot = this.bot;
    const decision = toolDecision(bot, block, policyInput);
    if (decision.skip) return decision;
    if (decision.item && bot.heldItem?.slot !== decision.item.slot) await bot.equip(decision.item, 'hand');
    if (!decision.item && bot.heldItem && typeof bot.unequip === 'function') await bot.unequip('hand');
    return decision;
  }

  validateBlock(block, policy) {
    if (!matchesFilter(block, policy)) return 'filtered';
    return blockHazard(this.bot, block, policy);
  }

  async mineOnce(block, policyInput = {}) {
    const policy = normalizeMiningPolicy(policyInput);
    const hazard = this.validateBlock(block, policy);
    if (hazard) throw new MiningBlockError(block, hazard);
    const decision = await this.equipFor(block, policy);
    if (decision.skip) return { mined: false, skipped: true, reason: decision.reason, policy };
    await this.bot.dig(block, 'ignore', 'raycast');
    return { mined: true, skipped: false, policy };
  }

  startConsistent(block, depth = 1, policyInput = {}) {
    const bot = this.bot;
    if (!bot?.entity) throw new Error('An active connection is required.');
    if (this.activities.has('consistentmine')) throw new Error('Consistent mining is already running.');
    const policy = normalizeMiningPolicy(policyInput);
    const initialHazard = this.validateBlock(block, policy);
    if (initialHazard) throw new MiningBlockError(block, initialHazard);
    const direction = miningDirection(bot, block);
    const positions = Array.from({ length: depth }, (_, index) => block.position.plus(direction.scaled(index)));
    let running = true;
    let timer = null;
    let warned = '';
    const detail = `${depth} locked ${depth === 1 ? 'block' : 'blocks'} from ${positionText(block.position)}; ${policyText(policy)}`;
    const state = { paused: false, blockedSince: null, waitReason: '', detail };
    const stop = () => {
      running = false;
      if (timer) this.cancelSchedule(timer);
      if (bot.targetDigBlock) void bot.stopDigging().catch(() => {});
      if (this.consistent?.state === state) this.consistent = null;
    };
    const tick = async () => {
      if (!running || !bot.entity) return this.activities.stop('consistentmine');
      if (state.paused) {
        if (running) timer = this.schedule(tick, this.tickDelay);
        return;
      }
      try {
        const target = positions.map((position) => bot.blockAt(position)).find((candidate) => candidate && !['air', 'cave_air', 'void_air'].includes(candidate.name));
        if (target) {
          const result = await this.mineOnce(target, policy);
          state.blockedSince = null;
          if (state.waitReason) {
            state.waitReason = '';
            warned = '';
            this.activities.update('consistentmine', detail);
          }
          if (result.skipped && warned !== result.reason) {
            warned = result.reason;
            this.logger.warn(`[ConsistentMine] Waiting because ${result.reason.replaceAll('-', ' ')}.`);
          }
        } else if (state.waitReason !== 'replacement') {
          state.blockedSince = null;
          state.waitReason = 'replacement';
          this.activities.update('consistentmine', `Waiting for a block at ${positionText(positions[0])}`);
        }
      } catch (error) {
        if (!running) return;
        if (state.paused) {
          timer = this.schedule(tick, this.tickDelay);
          return;
        }
        if (error instanceof MiningBlockError && error.reason === 'not-diggable') {
          state.blockedSince ??= this.now();
          state.waitReason = error.block;
          const elapsed = this.now() - state.blockedSince;
          if (elapsed < this.blockedTimeout) {
            if (warned !== error.block) {
              warned = error.block;
              this.logger.warn(`[ConsistentMine] Waiting for the locked position to become diggable again because it briefly contains ${error.block}.`);
            }
            this.activities.update('consistentmine', `Waiting at ${positionText(positions[0])}; temporary ${error.block}`);
            if (running) timer = this.schedule(tick, this.tickDelay);
            return;
          }
          this.logger.warn(`[ConsistentMine] Mining stopped because ${error.block} remained at the locked position for ${Math.round(this.blockedTimeout / 1000)} seconds.`);
          return this.activities.stop('consistentmine');
        }
        this.logger.warn(`[ConsistentMine] ${error.message}`);
        return this.activities.stop('consistentmine');
      }
      if (running) timer = this.schedule(tick, this.tickDelay);
    };
    this.activities.register('consistentmine', {
      label: 'Consistent mine',
      detail,
      resources: ['world'],
      stop
    });
    this.consistent = { state, bot, stop };
    timer = this.schedule(tick, 0);
    this.onChange();
    return { depth, positions: positions.map((position) => ({ x: position.x, y: position.y, z: position.z })), policy };
  }

  suspendConsistent(reason = 'another activity') {
    const current = this.consistent;
    if (!current || current.state.paused || !this.activities.has('consistentmine')) return () => {};
    current.state.paused = true;
    if (current.bot.targetDigBlock) void current.bot.stopDigging().catch(() => {});
    this.activities.update('consistentmine', `Paused for ${reason}`);
    return () => {
      if (this.consistent !== current || !this.activities.has('consistentmine')) return;
      current.state.paused = false;
      current.state.blockedSince = null;
      current.state.waitReason = '';
      this.activities.update('consistentmine', current.state.detail);
    };
  }

  startRegion(first, second, policyInput = {}) {
    const bot = this.bot;
    if (!bot?.entity) throw new Error('An active connection is required.');
    if (this.activities.has('regionmine')) throw new Error('Region mining is already running.');
    const policy = normalizeMiningPolicy(policyInput);
    const region = normalizeRegion(first, second, policy.maxBlocks);
    const state = { running: true, mined: 0, skipped: 0, blocked: 0, total: region.size, error: null };
    const stop = () => {
      state.running = false;
      cancelNavigation(bot);
      if (bot.targetDigBlock) void bot.stopDigging().catch(() => {});
    };
    this.lastRegion = { region, policy, state };
    this.activities.register('regionmine', {
      label: 'Region mine',
      detail: `Planning ${region.size} blocks from ${positionText(region.min)} to ${positionText(region.max)}; ${policyText(policy)}`,
      resources: ['movement', 'world'],
      stop
    });
    void this.runRegion(region, policy, state).catch((error) => {
      if (state.running) {
        state.error = error.message;
        this.logger.warn(`[RegionMine] ${error.message}`);
      }
    }).finally(() => {
      state.running = false;
      this.activities.finish('regionmine');
      this.onChange();
    });
    this.onChange();
    return { region, policy };
  }

  async runRegion(region, policy, state) {
    const bot = this.bot;
    const remaining = new Set(regionPositions(region).map((position) => `${position.x},${position.y},${position.z}`));
    let loadAttempts = 0;
    const unreachableStands = new Set();
    while (state.running && remaining.size) {
      const targets = [];
      let skippedThisPass = 0;
      let unloadedTarget = null;
      for (const value of remaining) {
        const [x, y, z] = value.split(',').map(Number);
        const block = bot.blockAt(new Vec3(x, y, z));
        if (!block) {
          unloadedTarget ||= { x, y, z };
          continue;
        }
        if (['air', 'cave_air', 'void_air'].includes(block.name)) {
          remaining.delete(value);
          continue;
        }
        const hazard = this.validateBlock(block, policy);
        if (hazard) {
          remaining.delete(value);
          state.skipped += 1;
          skippedThisPass += 1;
          continue;
        }
        targets.push({ x, y, z });
      }
      if (!targets.length && unloadedTarget) {
        if (loadAttempts >= 3) throw new Error(`The region near ${positionText(unloadedTarget)} could not be loaded.`);
        loadAttempts += 1;
        await navigate(bot, unloadedTarget, 4);
        await this.wait(250);
        continue;
      }
      if (!targets.length) break;
      const eye = bot.entity.position.offset(0, bot.entity.eyeHeight || 1.62, 0);
      const direct = targets.filter((position) => {
        const block = bot.blockAt(vec(position));
        return block && eye.distanceTo(block.position.offset(0.5, 0.5, 0.5)) <= policy.reach && (typeof bot.canSeeBlock !== 'function' || bot.canSeeBlock(block));
      }).sort((left, right) => right.y - left.y || distance(bot.entity.position, left) - distance(bot.entity.position, right));
      const stands = candidateStands(bot, region).filter((stand) => !unreachableStands.has(`${stand.x},${stand.y},${stand.z}`));
      const pathAware = direct.length ? null : await selectPathAwareStep(bot, targets, stands, policy.reach);
      const plan = direct.length
        ? { route: [{ stand: bot.entity.position.floored(), blocks: direct }] }
        : pathAware ? { route: [{ stand: pathAware.stand, blocks: pathAware.covered }] } : planReachRoute(targets, stands, bot.entity.position, policy.reach);
      if (!plan.route.length && unloadedTarget && loadAttempts < 3) {
        loadAttempts += 1;
        await navigate(bot, unloadedTarget, 4);
        await this.wait(250);
        continue;
      }
      if (!plan.route.length) throw new Error(`${targets.length} blocks remain but no safe reachable standing position was found.`);
      loadAttempts = 0;
      const step = plan.route[0];
      if (pathAware?.pathCost !== null && pathAware?.pathCost !== undefined) {
        this.activities.update('regionmine', `${state.mined} mined; route cost ${pathAware.pathCost.toFixed(1)} across ${pathAware.checked} candidates`);
      }
      if (distance(bot.entity.position, step.stand) > 0.8) {
        try {
          await navigate(bot, step.stand, 0);
        } catch (error) {
          unreachableStands.add(`${step.stand.x},${step.stand.y},${step.stand.z}`);
          this.activities.update('regionmine', `${state.mined} mined; trying another route after ${positionText(step.stand)}`);
          if (unreachableStands.size >= Math.min(12, stands.length)) throw new Error(`No safe route into the region was found. Last route: ${error.message}`);
          continue;
        }
      }
      let progressed = skippedThisPass > 0;
      for (const position of step.blocks) {
        if (!state.running) return;
        const value = `${position.x},${position.y},${position.z}`;
        const block = bot.blockAt(vec(position));
        if (!block || ['air', 'cave_air', 'void_air'].includes(block.name)) {
          remaining.delete(value);
          continue;
        }
        const eye = bot.entity.position.offset(0, bot.entity.eyeHeight || 1.62, 0);
        if (eye.distanceTo(block.position.offset(0.5, 0.5, 0.5)) > policy.reach + 0.2) continue;
        const hazard = this.validateBlock(block, policy);
        if (hazard) {
          remaining.delete(value);
          state.skipped += 1;
          continue;
        }
        if (typeof bot.canSeeBlock === 'function' && !bot.canSeeBlock(block)) continue;
        const result = await this.mineOnce(block, policy);
        if (result.skipped) {
          remaining.delete(value);
          state.skipped += 1;
          continue;
        }
        remaining.delete(value);
        state.mined += 1;
        progressed = true;
        if (state.mined % 8 === 0) this.activities.update('regionmine', `${state.mined} mined, ${state.skipped} safely skipped, ${remaining.size} remaining`);
      }
      if (!progressed) {
        state.blocked += 1;
        if (state.blocked >= 3) throw new Error(`${remaining.size} blocks remain and the route cannot make progress.`);
      } else {
        state.blocked = 0;
        unreachableStands.clear();
      }
    }
    if (state.running) this.logger.log(`[RegionMine] Finished with ${state.mined} mined and ${state.skipped} safely skipped.`);
  }

  status() {
    if (!this.lastRegion) return null;
    const { region, policy, state } = this.lastRegion;
    return { region, policy, state: { ...state } };
  }
}

module.exports = { MiningBlockError, MiningService, matchesFilter, miningDirection, navigate };
