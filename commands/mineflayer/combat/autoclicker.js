'use strict';

const settings = new WeakMap();

function configuration(bot) {
  if (!settings.has(bot)) settings.set(bot, { interval: 1000, overrideFriendProtection: false });
  return settings.get(bot);
}

function start(bot, activities, actions, logger, overrideFriendProtection, origin) {
  const state = configuration(bot);
  state.overrideFriendProtection = overrideFriendProtection;
  let running = true;
  let timer = null;
  const stop = () => {
    running = false;
    if (timer) clearTimeout(timer);
  };
  const tick = async () => {
    if (!running || !bot.entity) return activities.stop('autoclicker');
    try {
      const entity = bot.entityAtCursor();
      if (entity && !['experience_orb', 'item'].includes(entity.name)) {
        if (entity.type === 'player' && entity.username) {
          await actions.execute({ actionId: 'player.attack', username: entity.username, overrideFriendProtection: state.overrideFriendProtection }, { bot, activities, origin });
        } else {
          await bot.attack(entity, true);
        }
      } else {
        bot.swingArm();
      }
    } catch (error) {
      logger.debug(`[Autoclicker] ${error.message}`);
    }
    if (running) timer = setTimeout(tick, state.interval);
  };
  activities.register('autoclicker', {
    label: 'Autoclicker',
    detail: `Every ${state.interval} ms${overrideFriendProtection ? ', friend override' : ''}`,
    resources: ['combat'],
    stop
  });
  timer = setTimeout(tick, 0);
}

module.exports = {
  command: 'autoclicker',
  aliases: ['clicker'],
  usage: 'autoclicker <start|stop|speed> [milliseconds] [--override-friend-protection]',
  description: 'Repeatedly swing or attack the entity under the cursor.',
  requires: { entity: true },
  autocomplete: () => ['start', 'stop', 'speed'],

  execute(sender, command, args, { actions, activities, bot, logger }) {
    const action = args[0]?.toLowerCase();
    const state = configuration(bot);
    if (!action) return sender.reply(`[Autoclicker] Usage: ${this.usage}`);
    if (action === 'stop') {
      return sender.reply(activities.stop('autoclicker') ? '[Autoclicker] Stopped.' : '[Autoclicker] Already stopped.');
    }
    if (action === 'speed') {
      if (args[1] === undefined) return sender.reply(`[Autoclicker] Interval: ${state.interval} ms.`);
      const nextInterval = Number(args[1]);
      if (!Number.isInteger(nextInterval) || nextInterval < 50 || nextInterval > 60000) return sender.reply('[Autoclicker] Interval must be an integer from 50 to 60000 ms.');
      state.interval = nextInterval;
      if (activities.has('autoclicker')) activities.update('autoclicker', `Every ${state.interval} ms${state.overrideFriendProtection ? ', friend override' : ''}`);
      return sender.reply(`[Autoclicker] Interval changed to ${state.interval} ms.`);
    }
    if (action === 'start') {
      if (activities.has('autoclicker')) return sender.reply('[Autoclicker] Already running.');
      start(bot, activities, actions, logger, args.includes('--override-friend-protection'), sender);
      return sender.reply(`[Autoclicker] Started at ${state.interval} ms.`);
    }
    return sender.reply(`[Autoclicker] Usage: ${this.usage}`);
  }
};
