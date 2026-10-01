'use strict';

const { GoalNear } = require('mineflayer-pathfinder').goals;
const { Vec3 } = require('vec3');
const { distance, key } = require('./mining-planner');
const { navigateGoal } = require('./navigation-service');
const { computePath } = require('./path-cost-planner');
const { emptySpace, isTreeLeaf, isTreeLog, solidSupport } = require('./tree-planner');

function vec(position) {
  return new Vec3(position.x, position.y, position.z);
}

function positionValue(position) {
  return { x: Math.floor(position.x), y: Math.floor(position.y), z: Math.floor(position.z) };
}

function positionText(position) {
  return `${Math.floor(position.x)}, ${Math.floor(position.y)}, ${Math.floor(position.z)}`;
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

function movementKey(left, right) {
  return [key(left), key(right)].sort().join('|');
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

function cardinalBridgeTarget(bot, path, policy) {
  return cardinalBridgeRoute(bot, path, policy)?.[0] || null;
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
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      bot.removeListener('physicsTick', inspect);
      bot.clearControlStates?.();
      resolve(value);
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

module.exports = {
  allowLeafAccess,
  cardinalBridgeRoute,
  cardinalBridgeTarget,
  estimateTreePath,
  localCardinalRoute,
  localCardinalStep,
  movementKey,
  navigateTreeStance,
  nearbyHopTarget,
  positionText,
  recoverNearbyHop,
  tryNearbyHop
};
