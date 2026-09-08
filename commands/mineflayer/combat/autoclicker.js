'use strict';

let interval = 1000;

function start(bot, activities) {
  const handle = setInterval(() => {
    if (!bot.entity) return activities.stop('autoclicker');
    const entity = bot.entityAtCursor();
    if (entity && !['experience_orb', 'item'].includes(entity.name)) {
      void bot.attack(entity, true);
    } else {
      bot.swingArm();
    }
  }, interval);
  activities.register('autoclicker', {
    label: 'Autoclicker',
    detail: `Every ${interval} ms`,
    stop: () => clearInterval(handle)
  });
}

module.exports = {
  command: 'autoclicker',
  aliases: ['clicker'],
  usage: 'autoclicker <start|stop|speed> [milliseconds]',
  description: 'Repeatedly swing or attack the entity under the cursor.',
  requires: { entity: true },
  autocomplete: () => ['start', 'stop', 'speed'],

  execute(sender, command, args, { activities, bot }) {
    const action = args[0]?.toLowerCase();
    if (!action) return sender.reply(`[Autoclicker] Usage: ${this.usage}`);
    if (action === 'stop') {
      return sender.reply(activities.stop('autoclicker') ? '[Autoclicker] Stopped.' : '[Autoclicker] Already stopped.');
    }
    if (action === 'speed') {
      if (args[1] === undefined) return sender.reply(`[Autoclicker] Interval: ${interval} ms.`);
      const nextInterval = Number(args[1]);
      if (!Number.isInteger(nextInterval) || nextInterval < 50 || nextInterval > 60000) return sender.reply('[Autoclicker] Interval must be an integer from 50 to 60000 ms.');
      const running = activities.stop('autoclicker');
      interval = nextInterval;
      if (running) start(bot, activities);
      return sender.reply(`[Autoclicker] Interval changed to ${interval} ms.`);
    }
    if (action === 'start') {
      if (activities.has('autoclicker')) return sender.reply('[Autoclicker] Already running.');
      start(bot, activities);
      return sender.reply(`[Autoclicker] Started at ${interval} ms.`);
    }
    return sender.reply(`[Autoclicker] Usage: ${this.usage}`);
  }
};
