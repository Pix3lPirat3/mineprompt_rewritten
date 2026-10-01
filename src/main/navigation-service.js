'use strict';

function cancelNavigation(bot) {
  if (typeof bot?.pathfinder?.setGoal === 'function') bot.pathfinder.setGoal(null);
  else bot?.pathfinder?.stop?.();
  bot?.clearControlStates?.();
}

function goalReached(bot, goal) {
  if (!bot?.entity?.position || typeof goal?.isEnd !== 'function') return true;
  if (!('goal' in bot.pathfinder)) return true;
  try { return goal.isEnd(bot.entity.position.floored()); } catch { return false; }
}

async function navigateGoal(bot, goal, options = {}) {
  if (!bot?.pathfinder || typeof bot.pathfinder.goto !== 'function') throw new Error('Pathfinding is not available.');
  const timeout = Number(options.timeout) || 120000;
  const description = String(options.description || 'the destination');
  let timer = null;
  let timedOut = false;
  try {
    await Promise.race([
      bot.pathfinder.goto(goal),
      new Promise((resolve, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          cancelNavigation(bot);
          reject(new Error(`No path reached ${description} within ${Math.round(timeout / 1000)} seconds.`));
        }, timeout);
      })
    ]);
    if (!goalReached(bot, goal)) throw new Error(`Pathfinding stopped before reaching ${description}.`);
  } finally {
    if (timer) clearTimeout(timer);
    if (!timedOut && bot.pathfinder.goal === goal) cancelNavigation(bot);
  }
}

module.exports = { cancelNavigation, goalReached, navigateGoal };
