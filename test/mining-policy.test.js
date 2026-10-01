'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseMiningFlags, remainingDurability, toolDecision } = require('../src/main/mining-policy');

function fixture() {
  const worn = { slot: 1, type: 7, name: 'diamond_pickaxe', maxDurability: 100, durabilityUsed: 95 };
  const safe = { slot: 2, type: 7, name: 'iron_pickaxe', maxDurability: 100, durabilityUsed: 20 };
  const bot = {
    heldItem: worn,
    inventory: { items: () => [worn, safe] },
    pathfinder: { bestHarvestTool: () => worn },
    registry: { itemsByName: {}, version: { '<': () => false } }
  };
  const block = { name: 'stone', displayName: 'Stone', harvestTools: { 7: true }, canHarvest: (type) => type === 7 };
  return { block, bot, safe, worn };
}

test('switches away from a preferred low-durability tool', () => {
  const { block, bot, safe, worn } = fixture();
  assert.equal(remainingDurability(worn, bot), 5);
  assert.equal(toolDecision(bot, block).item, safe);
});

test('ranks safe alternatives by real dig time including enchantments', () => {
  const { block, bot, safe } = fixture();
  const enchanted = { slot: 3, type: 7, name: 'golden_pickaxe', maxDurability: 120, durabilityUsed: 10, enchants: [{ name: 'efficiency', lvl: 4 }] };
  bot.inventory.items = () => [safe, enchanted];
  block.digTime = (type, creative, inWater, notOnGround, enchantments) => type === enchanted.type && enchantments.length ? 100 : 400;
  assert.equal(toolDecision(bot, block).item, enchanted);
});

test('supports held-tool stop and skip policies', () => {
  const { block, bot, safe } = fixture();
  assert.throws(() => toolDecision(bot, block, { tool: 'held', minimumDurability: 10 }), /5 durability/u);
  assert.equal(toolDecision(bot, block, { tool: 'held', minimumDurability: 10, lowDurability: 'skip' }).skip, true);
  assert.equal(toolDecision(bot, block, { tool: 'held', minimumDurability: 10, lowDurability: 'switch' }).item, safe);
});

test('parses composable mining flags without mixing them into coordinates', () => {
  const parsed = parseMiningFlags(['0', '60', '0', '4', '63', '4', '--tool', 'held', '--low', 'stop', '--min-durability', '25', '--include', 'stone,deepslate', '--allow-fluid-adjacent']);
  assert.deepEqual(parsed.positional, ['0', '60', '0', '4', '63', '4']);
  assert.equal(parsed.policy.tool, 'held');
  assert.equal(parsed.policy.minimumDurability, 25);
  assert.deepEqual(parsed.policy.include, ['stone', 'deepslate']);
  assert.equal(parsed.policy.allowFluidAdjacent, true);
});
