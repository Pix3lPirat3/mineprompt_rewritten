'use strict';

const { GoalNear } = require('mineflayer-pathfinder').goals;
const { Vec3 } = require('vec3');
const { navigateGoal } = require('./navigation-service');
const { collectedItems, inventoryCounts, waitForPickup } = require('./stash-service');
const { distance, key } = require('./mining-planner');
const { emptySpace } = require('./tree-planner');

const SAPLINGS = Object.freeze({
  oak: 'oak_sapling',
  spruce: 'spruce_sapling',
  birch: 'birch_sapling',
  jungle: 'jungle_sapling',
  acacia: 'acacia_sapling',
  dark_oak: 'dark_oak_sapling',
  mangrove: 'mangrove_propagule',
  cherry: 'cherry_sapling',
  pale_oak: 'pale_oak_sapling'
});
const SOILS = new Set(['dirt', 'grass_block', 'podzol', 'coarse_dirt', 'rooted_dirt', 'moss_block', 'mycelium', 'mud', 'muddy_mangrove_roots']);

function positionValue(position) {
  return { x: Math.floor(position.x), y: Math.floor(position.y), z: Math.floor(position.z) };
}

function droppedItem(entity) {
  try { return entity?.getDroppedItem?.() || null; } catch { return null; }
}

function relevantDrop(entity, tree, radius) {
  if (entity?.name !== 'item' || entity.isValid === false || !entity.position) return false;
  return tree.logs.some((position) => distance(position, entity.position) <= radius);
}

function treeDrops(bot, tree, radius) {
  return Object.values(bot.entities || {}).filter((entity) => relevantDrop(entity, tree, radius)).sort((left, right) =>
    bot.entity.position.distanceTo(left.position) - bot.entity.position.distanceTo(right.position) || Number(left.id) - Number(right.id));
}

async function waitForTreeDropWave(bot, tree, radius, attempted = new Set(), maximumTicks = 8) {
  const pending = () => treeDrops(bot, tree, radius).filter((entity) => !attempted.has(entity));
  if (typeof bot.waitForTicks !== 'function') return pending();
  for (let elapsed = 0; elapsed < maximumTicks; elapsed += 2) {
    await bot.waitForTicks(2);
    const drops = pending();
    if (drops.length) return drops;
  }
  return [];
}

function expectedLogDrops(bot, tree, before, collectedEntities) {
  const name = `${tree.species}_log`;
  const collected = collectedItems(before, inventoryCounts(bot)).filter((entry) => entry.item?.name === name).reduce((sum, entry) => sum + entry.count, 0);
  const pending = [...collectedEntities].map(droppedItem).filter((item) => item?.name === name).reduce((sum, item) => sum + (Number(item.count) || 0), 0);
  return collected + pending;
}

async function collectTreeDrops(bot, tree, policy, before = inventoryCounts(bot), onProgress = () => {}, expectedLogs = 0) {
  if (!policy.collectDrops) return { collected: 0, skipped: 0, entries: [] };
  const attempted = new Set();
  const collectedEntities = new Set();
  let skipped = 0;
  let firstWave = true;
  while (true) {
    const accounted = expectedLogDrops(bot, tree, before, collectedEntities);
    const maximumTicks = expectedLogs > accounted ? 60 : firstWave ? 20 : 8;
    const drops = await waitForTreeDropWave(bot, tree, policy.collectionRadius, attempted, maximumTicks);
    firstWave = false;
    if (!drops.length) break;
    for (const entity of drops) {
      if (entity.isValid === false) continue;
      attempted.add(entity);
      onProgress(`Collecting ${droppedItem(entity)?.displayName || 'tree drop'}`);
      try {
        await navigateGoal(bot, new GoalNear(entity.position.x, entity.position.y, entity.position.z, 0), { timeout: 10000, description: 'a tree drop' });
        if (!await waitForPickup(bot, entity, 20)) throw new Error('A tree drop did not reach the inventory.');
        collectedEntities.add(entity);
      } catch {
        skipped += 1;
      }
    }
  }
  const entries = collectedItems(before, inventoryCounts(bot));
  return { collected: entries.reduce((sum, entry) => sum + entry.count, 0), skipped, entries };
}

function availableItems(bot, name) {
  return (bot.inventory?.items?.() || []).filter((item) => item.name === name).reduce((sum, item) => sum + (Number(item.count) || 0), 0);
}

function plantingSites(bot, tree) {
  return tree.base.slice(0, 4).map(positionValue).filter((position) => {
    const target = bot.blockAt(new Vec3(position.x, position.y, position.z));
    const soil = bot.blockAt(new Vec3(position.x, position.y - 1, position.z));
    return emptySpace(target) && SOILS.has(String(soil?.name || ''));
  }).sort((left, right) => key(left).localeCompare(key(right)));
}

async function replantTree(bot, tree, policy, onProgress = () => {}) {
  if (policy.replant === 'never') return { planted: 0, skipped: 0, reason: null };
  const itemName = SAPLINGS[tree.species];
  const sites = plantingSites(bot, tree);
  const fail = (message) => {
    if (policy.replant === 'required') throw new Error(message);
    return { planted: 0, skipped: sites.length || tree.base.length, reason: message };
  };
  if (!itemName) return fail(`No replanting item is known for ${tree.species}.`);
  if (!sites.length) return fail('No original tree base is clear and plantable.');
  if (availableItems(bot, itemName) < sites.length) return fail(`Replanting needs ${sites.length} ${itemName.replaceAll('_', ' ')}.`);
  let planted = 0;
  for (const site of sites) {
    onProgress(`Replanting at ${site.x}, ${site.y}, ${site.z}`);
    if (bot.entity.position.distanceTo(new Vec3(site.x, site.y, site.z)) > 4.5) {
      await navigateGoal(bot, new GoalNear(site.x, site.y, site.z, 3), { timeout: 15000, description: 'the tree base' });
    }
    const item = (bot.inventory?.items?.() || []).find((entry) => entry.name === itemName);
    if (!item) return fail(`No ${itemName.replaceAll('_', ' ')} remains for replanting.`);
    const soil = bot.blockAt(new Vec3(site.x, site.y - 1, site.z));
    const target = bot.blockAt(new Vec3(site.x, site.y, site.z));
    if (!emptySpace(target) || !SOILS.has(String(soil?.name || ''))) return fail(`The tree base at ${site.x}, ${site.y}, ${site.z} is no longer plantable.`);
    await bot.equip(item, 'hand');
    await bot.lookAt(new Vec3(site.x + 0.5, site.y, site.z + 0.5), true);
    await bot.placeBlock(soil, new Vec3(0, 1, 0));
    planted += 1;
  }
  return { planted, skipped: 0, reason: null };
}

module.exports = { SAPLINGS, SOILS, availableItems, collectTreeDrops, expectedLogDrops, plantingSites, relevantDrop, replantTree, treeDrops, waitForTreeDropWave };
