'use strict';

module.exports = {
  command: 'animation',
  aliases: ['swing'],
  usage: 'animation <left|right>',
  description: 'Swing the main hand or off hand.',
  requires: { entity: true },
  autocomplete: () => ['left', 'right'],

  execute(sender, command, args, { bot }) {
    const hand = args[0]?.toLowerCase();
    if (!['left', 'right'].includes(hand) || args.length !== 1) return sender.reply(`[Animation] Usage: ${this.usage}`);
    bot.swingArm(hand, true);
    return sender.reply(`[Animation] Swung the ${hand} hand.`);
  }
};
