'use strict';

const { GoalNear } = require('mineflayer-pathfinder').goals;
const { key, rankReachOptions } = require('./mining-planner');

function computePath(bot, goal, timeout, searchRadius) {
  const generator = bot.pathfinder.getPathFromTo(bot.pathfinder.movements, bot.entity.position, goal, {
    optimizePath: false,
    resetEntityIntersects: true,
    timeout,
    tickTimeout: Math.min(10, timeout),
    searchRadius
  });
  let result = null;
  for (const step of generator) {
    result = step.result;
    if (result.status !== 'partial') break;
  }
  return result;
}

async function selectPathAwareStep(bot, targets, stands, reach, options = {}) {
  const limit = Math.max(1, Math.min(12, Number(options.candidateLimit) || 6));
  const timeout = Math.max(5, Math.min(100, Number(options.timeout) || 35));
  const ranked = rankReachOptions(targets, stands, bot.entity.position, reach).slice(0, limit);
  if (!ranked.length) return null;
  if (typeof bot.pathfinder?.getPathFromTo !== 'function' || !bot.pathfinder.movements) return { ...ranked[0], pathCost: null, pathStatus: 'unavailable', checked: 0 };
  const reachable = [];
  for (const option of ranked) {
    const radius = Math.max(16, Math.min(128, Math.ceil(option.travel) + 12));
    let result = null;
    try { result = computePath(bot, new GoalNear(option.stand.x, option.stand.y, option.stand.z, 0), timeout, radius); } catch {}
    if (result?.status === 'success' && Number.isFinite(Number(result.cost))) {
      const pathCost = Number(result.cost);
      reachable.push({ ...option, pathCost, pathStatus: result.status, checked: ranked.length, routeScore: option.covered.length / (1 + pathCost / 4) });
    }
    await new Promise((resolve) => { globalThis.setImmediate(resolve); });
  }
  reachable.sort((left, right) => right.routeScore - left.routeScore || right.covered.length - left.covered.length || left.pathCost - right.pathCost || key(left.stand).localeCompare(key(right.stand)));
  return reachable[0] || { ...ranked[0], pathCost: null, pathStatus: 'unresolved', checked: ranked.length };
}

module.exports = { computePath, selectPathAwareStep };
