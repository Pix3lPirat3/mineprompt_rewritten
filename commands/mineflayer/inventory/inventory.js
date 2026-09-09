'use strict';

const { createTextTable } = require('../../../src/main/text-table');
const { DESTINATIONS, QUANTITIES, itemName } = require('../../../src/main/inventory-service');

const ACTIONS = ['list', 'inspect', 'equip', 'select', 'use', 'drop'];

module.exports = {
  command: 'inventory',
  aliases: ['inv'],
  usage: 'inventory [list|inspect <slot>|equip <item|slot> [destination]|select <0-8>|use [item|slot|mainhand|offhand]|drop <item|slot|all> [one|stack|all] [confirm]]',
  description: 'Inspect and manage carried items. Use inventory help for examples.',
  requires: { entity: true, console: true },

  autocomplete(command, args, { inventory }, completion = {}) {
    if (!args.length || (args.length === 1 && !ACTIONS.includes(args[0].toLowerCase()))) return ACTIONS;
    const action = args[0]?.toLowerCase();
    if (action === 'select') return ['0', '1', '2', '3', '4', '5', '6', '7', '8'];
    if (action === 'equip' && (args.length > 2 || (args.length === 2 && completion.trailingSpace))) return [...DESTINATIONS];
    if (action === 'drop' && (args.length > 2 || (args.length === 2 && completion.trailingSpace))) return [...QUANTITIES, 'confirm'];
    if (action === 'use') return ['mainhand', 'offhand', ...inventory.selectors('inventory')];
    if (['inspect', 'equip', 'drop'].includes(action)) return ['all', ...inventory.selectors('inventory')];
    return [];
  },

  async execute(sender, command, args, { inventory }) {
    const action = args[0]?.toLowerCase() || 'list';
    if (action === 'help') {
      return sender.reply('[Inventory] Examples:\ninventory inspect 36\ninventory equip diamond_pickaxe hand\ninventory select 2\ninventory use cooked_beef\ninventory drop cobblestone stack\ninventory drop all confirm');
    }
    if (action === 'list') {
      if (args.length > 1) return sender.reply(`[Inventory] Usage: ${this.usage}`);
      const rows = inventory.items('inventory').map((item) => ({ slot: item.slot, item: item.name, count: item.count, name: itemName(item) }));
      return sender.reply(rows.length ? createTextTable(rows) : '[Inventory] Empty.');
    }
    if (/^\d+$/u.test(action) && args.length === 1) {
      const result = await inventory.execute({ scope: 'inventory', action: 'inspect', target: action });
      return sender.reply(result.message);
    }
    if (action === 'inspect' && args.length === 2) {
      const result = await inventory.execute({ scope: 'inventory', action, target: args[1] });
      return sender.reply(result.message);
    }
    if (action === 'equip' && args.length >= 2 && args.length <= 3) {
      const result = await inventory.execute({ scope: 'inventory', action, target: args[1], destination: args[2] });
      return sender.reply(result.message);
    }
    if (action === 'select' && args.length === 2) {
      const result = await inventory.execute({ scope: 'inventory', action, target: args[1] });
      return sender.reply(result.message);
    }
    if (action === 'use' && args.length <= 2) {
      const hand = ['mainhand', 'offhand'].includes(args[1]?.toLowerCase()) ? args[1] : 'mainhand';
      const target = hand === args[1]?.toLowerCase() ? undefined : args[1];
      const result = await inventory.execute({ scope: 'inventory', action, target, hand });
      return sender.reply(result.message);
    }
    if (action === 'drop' && args.length >= 2 && args.length <= 4) {
      if (args[2] && !QUANTITIES.has(args[2].toLowerCase()) && args[2].toLowerCase() !== 'confirm') return sender.reply(`[Inventory] Usage: ${this.usage}`);
      if (args[3] && args[3].toLowerCase() !== 'confirm') return sender.reply(`[Inventory] Usage: ${this.usage}`);
      const result = await inventory.execute({
        scope: 'inventory',
        action,
        target: args[1],
        quantity: args[1].toLowerCase() === 'all' ? 'all' : QUANTITIES.has(args[2]?.toLowerCase()) ? args[2] : 'stack',
        confirmed: args.some((value) => value.toLowerCase() === 'confirm')
      });
      return sender.reply(result.message);
    }
    return sender.reply(`[Inventory] Usage: ${this.usage}`);
  }
};
