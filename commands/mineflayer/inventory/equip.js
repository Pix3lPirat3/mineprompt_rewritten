'use strict';

const { closestMatches } = require('../../../src/main/suggestions');

const DESTINATIONS = ['hand', 'head', 'torso', 'legs', 'feet', 'off-hand'];

module.exports = {
  command: 'equip',
  usage: 'equip <item> [hand|head|torso|legs|feet|off-hand]',
  description: 'Equip an inventory item in the requested slot.',
  requires: { entity: true },
  autocomplete: () => [...DESTINATIONS, ...new Set(bot.inventory.items().map((item) => item.name))],

  async execute(sender, command, args) {
    if (!args[0]) return sender.reply(`[Equip] Usage: ${this.usage}`);
    const requested = args[0].toLowerCase();
    const item = bot.inventory.items().find((entry) => entry.name.toLowerCase() === requested);
    if (!item) {
      const suggestions = closestMatches(requested, bot.inventory.items().map((entry) => entry.name));
      return sender.reply(`[Equip] No ${requested} was found${suggestions.length ? `. Did you mean ${suggestions.join(', ')}?` : '.'}`);
    }

    const destination = args[1]?.toLowerCase() || 'hand';
    if (!DESTINATIONS.includes(destination)) return sender.reply(`[Equip] Destination must be ${DESTINATIONS.join(', ')}.`);
    await bot.equip(item, destination);
    return sender.reply(`[Equip] Equipped ${item.displayName || item.name} to ${destination}.`);
  }
};
