'use strict';

module.exports = {
  command: 'jump',
  usage: 'jump',
  description: 'Jump once.',
  requires: { entity: true },

  async execute(sender, command, args) {
    if (args.length) return sender.reply(`[Jump] Usage: ${this.usage}`);
    bot.setControlState('jump', true);
    try {
      await bot.waitForTicks(1);
    } finally {
      bot.setControlState('jump', false);
    }
    return sender.reply('[Jump] Jumped.');
  }
};
