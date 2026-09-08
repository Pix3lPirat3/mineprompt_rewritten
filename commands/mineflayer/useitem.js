'use strict';

module.exports = {
  command: 'useitem',
  aliases: ['activateitem'],
  usage: 'useitem [item|slot|mainhand|offhand]',
  description: 'Use a held or carried item. This is a shortcut for inventory use.',
  requires: { entity: true },
  autocomplete: (command, args, { inventory }) => ['mainhand', 'offhand', ...inventory.selectors('inventory')],

  async execute(sender, command, args, { inventory }) {
    if (args.length > 1) return sender.reply(`[UseItem] Usage: ${this.usage}`);
    const hand = ['mainhand', 'offhand'].includes(args[0]?.toLowerCase()) ? args[0] : 'mainhand';
    const target = hand === args[0]?.toLowerCase() ? undefined : args[0];
    const result = await inventory.execute({ scope: 'inventory', action: 'use', target, hand });
    return sender.reply(result.message);
  }
};
