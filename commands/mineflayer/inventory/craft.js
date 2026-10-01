'use strict';

const { createTextTable } = require('../../../src/main/text-table');

module.exports = {
  command: 'craft',
  usage: 'craft list [query] | craft <item> [times]',
  description: 'Find and perform recipes using the player inventory or a nearby crafting table.',
  requires: { entity: true },

  autocomplete(command, args, { bot }) {
    if (args.length <= 1) return ['list', ...Object.keys(bot.registry.itemsByName || {})];
    return [];
  },

  async execute(sender, command, args, { client, crafting }) {
    if (!args.length) return sender.reply(`[Crafting] Usage: ${this.usage}`);
    if (args[0].toLowerCase() === 'list') {
      const recipes = crafting.list({ query: args.slice(1).join(' '), craftableOnly: true, maximum: 80 });
      const rows = recipes.map((recipe, index) => ({ index: index + 1, result: recipe.name, count: recipe.resultCount, table: recipe.requiresTable ? 'yes' : 'no' }));
      return sender.reply(rows.length ? createTextTable(rows) : '[Crafting] No craftable recipes matched.');
    }
    const times = Number(args[1] ?? 1);
    if (!Number.isInteger(times) || times < 1 || times > 64) return sender.reply('[Crafting] Times must be an integer from 1 to 64.');
    const recipes = crafting.list({ query: args[0], craftableOnly: true, maximum: 250 });
    const recipe = recipes.find((entry) => entry.name.toLowerCase() === args[0].toLowerCase()) || recipes[0];
    if (!recipe) return sender.reply(`[Crafting] No available recipe was found for ${args[0]}.`);
    const result = await crafting.craft({ recipeId: recipe.id, item: recipe.name, count: times, connectionId: client.connectionAttempt });
    return sender.reply(result.message);
  }
};
