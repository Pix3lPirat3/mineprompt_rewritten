'use strict';

function start(bot, activities, logger, whitelist, delay) {
  let running = true;
  let timer = null;
  const stop = () => {
    running = false;
    if (timer) clearTimeout(timer);
  };
  const schedule = (callback, timeout) => {
    timer = setTimeout(callback, timeout);
  };
  const tick = async () => {
    if (!running || !bot.entity) return activities.stop('killaura');
    const entity = bot.nearestEntity((candidate) => {
      const allowed = whitelist.includes('*') || whitelist.includes(candidate.name);
      return allowed && candidate.isValid && bot.entity.position.distanceTo(candidate.position) < 3.5;
    });
    if (!entity || bot.usingHeldItem) return schedule(tick, 100);
    try {
      await bot.lookAt(entity.position.offset(0, 0.5, 0));
      if (running && entity.isValid && bot.entityAtCursor()?.id === entity.id) await bot.attack(entity);
    } catch (error) {
      logger.debug(`[Killaura] ${error.message}`);
    }
    if (running) schedule(tick, delay);
  };
  activities.register('killaura', {
    label: 'Killaura',
    detail: `${whitelist.join(', ')} every ${delay} ms`,
    stop
  });
  schedule(tick, 0);
}

module.exports = {
  command: 'killaura',
  usage: 'killaura <start|stop> <mob1,mob2|*> [delay-ms]',
  description: 'Attack nearby entities matching an explicit allowlist.',
  requires: { entity: true },
  autocomplete: () => ['start', 'stop'],

  execute(sender, command, args, { activities, bot, logger }) {
    const action = args[0]?.toLowerCase();
    if (action === 'stop') {
      activities.stop('killaura');
      return sender.reply('[Killaura] Stopped.');
    }
    if (action !== 'start' || !args[1]) return sender.reply(`[Killaura] Usage: ${this.usage}`);
    const delay = Number(args[2] ?? 1000);
    if (!Number.isInteger(delay) || delay < 100 || delay > 60000) return sender.reply('[Killaura] Delay must be an integer from 100 to 60000 ms.');
    const whitelist = args[1].split(',').map((entry) => entry.trim().toLowerCase()).filter(Boolean);
    if (!whitelist.length) return sender.reply('[Killaura] Provide at least one entity name.');
    start(bot, activities, logger, whitelist, delay);
    return sender.reply(`[Killaura] Started for ${whitelist.join(', ')} at ${delay} ms.`);
  }
};
