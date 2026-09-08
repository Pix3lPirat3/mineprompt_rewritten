'use strict';

const { closestMatches } = require('../../../src/main/suggestions');

module.exports = {
  command: 'dropitem',
  aliases: ['drop'],
  usage: 'dropitem <item|inventory>',
  description: 'Drop every stack of an item, or the full inventory.',
  requires: { entity: true },
  autocomplete: (command, args, { bot }) => ['inventory', ...new Set(bot.inventory.items().map((item) => item.name))],

  async execute(sender, command, args, { bot }) {
    const requested = args[0]?.toLowerCase();
    if (!requested) return sender.reply(`[Drop] Usage: ${this.usage}`);

    const items = bot.inventory.items();
    const targets = requested === 'inventory' ? items : items.filter((item) => item.name.toLowerCase() === requested);
    if (!targets.length) {
      const suggestions = closestMatches(requested, items.map((item) => item.name));
      return sender.reply(`[Drop] No ${requested} was found${suggestions.length ? `. Did you mean ${suggestions.join(', ')}?` : '.'}`);
    }

    for (const item of targets) {
      await bot.tossStack(item);
      if (targets.length > 1) await bot.waitForTicks(2);
    }
    return sender.reply(`[Drop] Dropped ${targets.length} stack${targets.length === 1 ? '' : 's'}.`);
  }
};
