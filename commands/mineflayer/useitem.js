'use strict';

module.exports = {
  command: 'useitem',
  aliases: ['activateitem'],
  usage: 'useitem [item|slot] [mainhand|offhand]',
  description: 'Use a held or carried item. This is a shortcut for inventory use.',
  requires: { entity: true },
  autocomplete: (command, args, { inventory }) => args.length > 1 ? ['mainhand', 'offhand'] : ['mainhand', 'offhand', ...inventory.selectors('inventory')],

  async execute(sender, command, args, { inventory }) {
    if (args.length > 2) return sender.reply(`[UseItem] Usage: ${this.usage}`);
    const firstIsHand = ['mainhand', 'offhand'].includes(args[0]?.toLowerCase());
    const hand = firstIsHand ? args[0] : args[1] || 'mainhand';
    if (!['mainhand', 'offhand'].includes(hand?.toLowerCase())) return sender.reply(`[UseItem] Usage: ${this.usage}`);
    const target = firstIsHand ? undefined : args[0];
    const result = await inventory.execute({ scope: 'inventory', action: 'use', target, hand });
    return sender.reply(result.message);
  }
};
