'use strict';

const state = { timer: null, interval: 1000 };

function stop() {
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
}

function start() {
  stop();
  state.timer = setInterval(() => {
    if (!bot?.entity) return stop();
    const entity = bot.entityAtCursor();
    if (entity && !['experience_orb', 'item'].includes(entity.name)) {
      void bot.attack(entity, true);
    } else {
      bot.swingArm();
    }
  }, state.interval);
}

module.exports = {
  command: 'autoclicker',
  aliases: ['clicker'],
  usage: 'autoclicker <start|stop|speed> [milliseconds]',
  description: 'Repeatedly swing or attack the entity under the cursor.',
  requires: { entity: true },
  autocomplete: () => ['start', 'stop', 'speed'],
  reload: { pre: stop },

  execute(sender, command, args) {
    const action = args[0]?.toLowerCase();
    if (!action) return sender.reply(`[Autoclicker] Usage: ${this.usage}`);
    if (action === 'stop') {
      if (!state.timer) return sender.reply('[Autoclicker] Already stopped.');
      stop();
      return sender.reply('[Autoclicker] Stopped.');
    }
    if (action === 'speed') {
      if (args[1] === undefined) return sender.reply(`[Autoclicker] Interval: ${state.interval} ms.`);
      const interval = Number(args[1]);
      if (!Number.isInteger(interval) || interval < 50 || interval > 60000) return sender.reply('[Autoclicker] Interval must be an integer from 50 to 60000 ms.');
      state.interval = interval;
      if (state.timer) start();
      return sender.reply(`[Autoclicker] Interval changed to ${interval} ms.`);
    }
    if (action === 'start') {
      if (state.timer) return sender.reply('[Autoclicker] Already running.');
      start();
      return sender.reply(`[Autoclicker] Started at ${state.interval} ms.`);
    }
    return sender.reply(`[Autoclicker] Usage: ${this.usage}`);
  }
};
