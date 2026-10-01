'use strict';

const { DESTINATIONS } = require('../../../src/main/inventory-service');

module.exports = {
  command: 'equip',
  usage: 'equip <item|slot> [hand|head|torso|legs|feet|off-hand]',
  description: 'Equip an inventory item. This is a shortcut for inventory equip.',
  requires: { entity: true },
  autocomplete: (command, args, { inventory }, completion = {}) => args.length >= 2 || (args.length === 1 && completion.trailingSpace)
    ? [...DESTINATIONS]
    : inventory.selectors('inventory'),

  async execute(sender, command, args, { inventory }) {
    if (!args[0] || args.length > 2) return sender.reply(`[Equip] Usage: ${this.usage}`);
    const result = await inventory.execute({ scope: 'inventory', action: 'equip', target: args[0], destination: args[1] });
    return sender.reply(result.message);
  }
};
