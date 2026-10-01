'use strict';

module.exports = {
  command: 'animation',
  aliases: ['swing'],
  usage: 'animation <left|right> [item|slot]',
  description: 'Swing an arm, optionally after equipping an inventory item.',
  requires: { entity: true },
  autocomplete: (command, args, { inventory }, completion = {}) => !args.length || (args.length === 1 && !completion.trailingSpace) ? ['left', 'right'] : inventory.selectors('inventory'),

  async execute(sender, command, args, { inventory }) {
    const hand = args[0]?.toLowerCase();
    if (!['left', 'right'].includes(hand) || args.length > 2) return sender.reply(`[Animation] Usage: ${this.usage}`);
    const result = await inventory.execute({ scope: 'inventory', action: 'swing', target: args[1], arm: hand });
    return sender.reply(result.message);
  }
};
