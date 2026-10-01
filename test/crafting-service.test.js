'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { CraftingService, recipeIngredients } = require('../src/main/crafting-service');

function fixture() {
  const recipe = {
    result: { id: 2, metadata: 0, count: 4 },
    requiresTable: true,
    delta: [{ id: 1, metadata: 0, count: -1 }, { id: 2, metadata: 0, count: 4 }]
  };
  const table = { name: 'crafting_table' };
  const calls = [];
  const bot = {
    entity: {},
    registry: {
      blocksByName: { crafting_table: { id: 10 } },
      items: { 1: { id: 1, name: 'oak_log', displayName: 'Oak Log' }, 2: { id: 2, name: 'oak_planks', displayName: 'Oak Planks' } }
    },
    findBlock: () => table,
    recipesFor: (id) => id === 2 ? [recipe] : [],
    recipesAll: (id) => id === 2 ? [recipe] : [],
    craft: async (...args) => calls.push(args)
  };
  const client = { bot, connectionAttempt: 4 };
  return { bot, calls, client, recipe, service: new CraftingService({ getClient: () => client }) };
}

test('lists available Mineflayer recipes with resolved ingredients', () => {
  const { service } = fixture();
  const recipes = service.list({ query: 'planks', craftableOnly: true });
  assert.equal(recipes.length, 1);
  assert.equal(recipes[0].name, 'oak_planks');
  assert.deepEqual(recipes[0].ingredients, [{ name: 'oak_log', displayName: 'Oak Log', count: 1 }]);
});

test('crafts a cached recipe through Mineflayer', async () => {
  const { calls, service } = fixture();
  const [recipe] = service.list({ query: 'planks' });
  await service.craft({ recipeId: recipe.id, count: 3, connectionId: 4 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1], 3);
  assert.equal(calls[0][2].name, 'crafting_table');
});

test('resolves recipe deltas without exposing protocol objects', () => {
  const { bot, recipe } = fixture();
  assert.deepEqual(recipeIngredients(recipe, bot.registry), [{ name: 'oak_log', displayName: 'Oak Log', count: 1 }]);
});
