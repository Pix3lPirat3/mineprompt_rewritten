'use strict';

function recipeIngredients(recipe, registry) {
  return (recipe.delta || []).filter((entry) => entry.id >= 0 && entry.count < 0).map((entry) => ({
    name: registry.items[entry.id]?.name || `item_${entry.id}`,
    displayName: registry.items[entry.id]?.displayName || registry.items[entry.id]?.name || `Item ${entry.id}`,
    count: Math.abs(entry.count)
  }));
}

class CraftingService {
  constructor({ getClient, onChange = () => {} }) {
    this.getClient = getClient;
    this.onChange = onChange;
    this.recipes = new Map();
  }

  client() {
    const client = this.getClient();
    if (!client?.bot?.entity) throw new Error('An active connection is required.');
    return client;
  }

  craftingTable(bot) {
    const type = bot.registry.blocksByName.crafting_table?.id;
    if (!Number.isInteger(type)) return null;
    return bot.findBlock({ matching: type, maxDistance: 5 });
  }

  list(request = {}) {
    const client = this.client();
    const bot = client.bot;
    const query = String(request.query || '').trim().toLowerCase();
    const maximum = Math.max(1, Math.min(250, Number(request.maximum) || 80));
    const table = this.craftingTable(bot);
    const craftableOnly = request.craftableOnly !== false;
    const items = Object.values(bot.registry.items || {}).filter((item) =>
      !query || item.name.includes(query) || String(item.displayName || '').toLowerCase().includes(query));
    const output = [];
    this.recipes.clear();
    for (const item of items) {
      const recipes = craftableOnly
        ? bot.recipesFor(item.id, null, 1, table)
        : bot.recipesAll(item.id, null, table);
      recipes.forEach((recipe, index) => {
        const id = `${item.id}:${recipe.result.metadata ?? 0}:${index}`;
        this.recipes.set(id, { recipe, table });
        output.push({
          id,
          name: item.name,
          displayName: item.displayName || item.name,
          resultCount: recipe.result.count,
          requiresTable: recipe.requiresTable === true,
          available: !recipe.requiresTable || Boolean(table),
          ingredients: recipeIngredients(recipe, bot.registry)
        });
      });
      if (output.length >= maximum) break;
    }
    return output.slice(0, maximum);
  }

  async craft(request) {
    const client = this.client();
    if (request.connectionId !== undefined && Number(request.connectionId) !== client.connectionAttempt) throw new Error('The recipe list belongs to an earlier connection.');
    let entry = this.recipes.get(String(request.recipeId || ''));
    if (!entry) {
      this.list({ query: request.item, craftableOnly: true, maximum: 250 });
      entry = this.recipes.get(String(request.recipeId || ''));
    }
    if (!entry) throw new Error('The selected recipe is no longer available.');
    if (entry.recipe.requiresTable && !entry.table) throw new Error('A crafting table must be nearby.');
    const count = Number(request.count ?? 1);
    if (!Number.isInteger(count) || count < 1 || count > 64) throw new Error('Craft count must be an integer from 1 to 64.');
    await client.bot.craft(entry.recipe, count, entry.table);
    this.onChange();
    return { message: `[Crafting] Completed the recipe ${count} time${count === 1 ? '' : 's'}.` };
  }
}

module.exports = { CraftingService, recipeIngredients };
