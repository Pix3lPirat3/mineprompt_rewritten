'use strict';

const { createTextTable } = require('../../../src/main/text-table');
const { QUANTITIES, itemName } = require('../../../src/main/inventory-service');

const ACTIONS = ['list', 'inspect', 'take', 'deposit', 'quick-move', 'close'];

module.exports = {
  command: 'container',
  aliases: ['window'],
  usage: 'container [list|inspect <slot>|take <item|slot> [one|stack|all]|deposit <item|slot|all> [one|stack|all] [confirm]|quick-move <slot>|close]',
  description: 'Inspect and transfer items in the open container. Use container help for examples.',
  requires: { entity: true, console: true },

  autocomplete(command, args, { inventory }, completion = {}) {
    if (!args.length || (args.length === 1 && !ACTIONS.includes(args[0].toLowerCase()))) return ACTIONS;
    const action = args[0]?.toLowerCase();
    if (['take', 'inspect', 'quick-move'].includes(action) && (args.length === 1 || (args.length === 2 && !completion.trailingSpace))) return inventory.selectors('container');
    if (action === 'deposit' && (args.length === 1 || (args.length === 2 && !completion.trailingSpace))) return ['all', ...inventory.selectors('inventory')];
    if (['take', 'deposit'].includes(action)) return [...QUANTITIES, 'confirm'];
    return [];
  },

  async execute(sender, command, args, { inventory }) {
    const action = args[0]?.toLowerCase() || 'list';
    if (action === 'help') {
      return sender.reply('[Container] Examples:\ncontainer inspect 4\ncontainer take 4 one\ncontainer take diamond all\ncontainer deposit cobblestone stack\ncontainer deposit all confirm\ncontainer close');
    }
    if (action === 'list') {
      if (args.length > 1) return sender.reply(`[Container] Usage: ${this.usage}`);
      const rows = inventory.items('container').map((item) => ({ slot: item.slot, item: item.name, count: item.count, name: itemName(item) }));
      return sender.reply(rows.length ? createTextTable(rows) : '[Container] Empty.');
    }
    if (/^\d+$/u.test(action) && args.length === 1) {
      const result = await inventory.execute({ scope: 'container', action: 'inspect', target: action });
      return sender.reply(result.message);
    }
    if (['inspect', 'quick-move'].includes(action) && args.length === 2) {
      const result = await inventory.execute({ scope: 'container', action, target: args[1] });
      return sender.reply(result.message);
    }
    if (action === 'take' && args.length >= 2 && args.length <= 3) {
      const result = await inventory.execute({ scope: 'container', action, target: args[1], quantity: args[2] });
      return sender.reply(result.message);
    }
    if (action === 'deposit' && args.length >= 2 && args.length <= 4) {
      if (args[2] && !QUANTITIES.has(args[2].toLowerCase()) && args[2].toLowerCase() !== 'confirm') return sender.reply(`[Container] Usage: ${this.usage}`);
      if (args[3] && args[3].toLowerCase() !== 'confirm') return sender.reply(`[Container] Usage: ${this.usage}`);
      const result = await inventory.execute({
        scope: 'container',
        action,
        target: args[1],
        quantity: args[1].toLowerCase() === 'all' ? 'all' : QUANTITIES.has(args[2]?.toLowerCase()) ? args[2] : 'stack',
        confirmed: args.some((value) => value.toLowerCase() === 'confirm')
      });
      return sender.reply(result.message);
    }
    if (action === 'close' && args.length === 1) {
      const result = await inventory.execute({ scope: 'container', action });
      return sender.reply(result.message);
    }
    return sender.reply(`[Container] Usage: ${this.usage}`);
  }
};
