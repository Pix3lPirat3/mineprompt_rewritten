'use strict';

const { QUANTITIES } = require('../../../src/main/inventory-service');

module.exports = {
  command: 'dropitem',
  aliases: ['drop'],
  usage: 'dropitem <item|slot|inventory> [one|stack|all] [confirm]',
  description: 'Drop carried items. This is a shortcut for inventory drop.',
  requires: { entity: true },
  autocomplete: (command, args, { inventory }, completion = {}) => args.length >= 2 || (args.length === 1 && completion.trailingSpace)
    ? [...QUANTITIES, 'confirm']
    : ['inventory', ...inventory.selectors('inventory')],

  async execute(sender, command, args, { inventory }) {
    if (!args[0] || args.length > 3) return sender.reply(`[Drop] Usage: ${this.usage}`);
    if (args[1] && !QUANTITIES.has(args[1].toLowerCase()) && args[1].toLowerCase() !== 'confirm') return sender.reply(`[Drop] Usage: ${this.usage}`);
    if (args[2] && args[2].toLowerCase() !== 'confirm') return sender.reply(`[Drop] Usage: ${this.usage}`);
    const target = args[0].toLowerCase() === 'inventory' ? 'all' : args[0];
    const result = await inventory.execute({
      scope: 'inventory',
      action: 'drop',
      target,
      quantity: target === 'all' ? 'all' : QUANTITIES.has(args[1]?.toLowerCase()) ? args[1] : 'stack',
      confirmed: args.some((value) => value.toLowerCase() === 'confirm')
    });
    return sender.reply(result.message);
  }
};
