'use strict';

const { GoalNear } = require('mineflayer-pathfinder').goals;
const { cancelNavigation, navigateGoal } = require('./navigation-service');

const STORAGE_BLOCKS = new Set(['barrel', 'chest', 'trapped_chest']);

function isStorageBlock(block) {
  const name = String(block?.name || '');
  return STORAGE_BLOCKS.has(name) || name === 'shulker_box' || name.endsWith('_shulker_box');
}

function positionValue(position) {
  return { x: Math.floor(position.x), y: Math.floor(position.y), z: Math.floor(position.z) };
}

function itemKey(item) {
  let nbt = '';
  try { nbt = JSON.stringify(item?.nbt ?? null); } catch { nbt = ''; }
  return `${item?.type}:${item?.metadata ?? 0}:${nbt}`;
}

function inventoryCounts(bot) {
  const counts = new Map();
  for (const item of bot.inventory?.items?.() || []) {
    const key = itemKey(item);
    const current = counts.get(key);
    if (current) current.count += Number(item.count) || 0;
    else counts.set(key, { key, count: Number(item.count) || 0, item });
  }
  return counts;
}

function collectedItems(before, after) {
  const result = [];
  for (const entry of after.values()) {
    const count = entry.count - (before.get(entry.key)?.count || 0);
    if (count > 0) result.push({ item: entry.item, count });
  }
  return result;
}

function selectedItems(bot, selector) {
  const items = bot.inventory?.items?.() || [];
  if (String(selector).toLowerCase() === 'all') return items.map((item) => ({ item, count: Number(item.count) || 0 }));
  const slot = Number(selector);
  const selected = Number.isInteger(slot)
    ? items.filter((item) => item.slot === slot)
    : items.filter((item) => [item.name, item.displayName].some((value) => String(value || '').toLowerCase() === String(selector).toLowerCase()));
  if (!selected.length) throw new Error(`No inventory item matches ${selector}.`);
  return selected.map((item) => ({ item, count: Number(item.count) || 0 }));
}

function nearbyDrops(bot, radius) {
  return Object.values(bot.entities || {})
    .filter((entity) => entity?.name === 'item' && entity.isValid !== false && entity.position && bot.entity.position.distanceTo(entity.position) <= radius)
    .sort((left, right) => bot.entity.position.distanceTo(left.position) - bot.entity.position.distanceTo(right.position));
}

function nearestStorage(bot, radius) {
  const positions = bot.findBlocks?.({ matching: isStorageBlock, maxDistance: radius, count: 256 }) || [];
  return positions
    .map((position) => bot.blockAt(position))
    .filter(isStorageBlock)
    .sort((left, right) => bot.entity.position.distanceTo(left.position) - bot.entity.position.distanceTo(right.position))[0] || null;
}

async function waitForPickup(bot, entity, maximumTicks = 20) {
  if (typeof bot.waitForTicks !== 'function') return;
  for (let elapsed = 0; elapsed < maximumTicks && entity.isValid !== false; elapsed += 2) await bot.waitForTicks(2);
}

class StashService {
  constructor({ getClient, activities, mining, logger, onChange = () => {} }) {
    this.getClient = getClient;
    this.activities = activities;
    this.mining = mining;
    this.logger = logger;
    this.onChange = onChange;
    this.lastRun = null;
  }

  get bot() {
    return this.getClient()?.bot || null;
  }

  start(request = {}) {
    const bot = this.bot;
    if (!bot?.entity) throw new Error('An active connection is required.');
    if (this.activities.has('stash')) throw new Error('An item stash run is already active.');
    if (bot.currentWindow) throw new Error('Close the current container before starting an item stash run.');
    const mode = String(request.mode || 'nearby').toLowerCase();
    if (!['nearby', 'inventory'].includes(mode)) throw new Error('Stash mode must be nearby or inventory.');
    const collectionRadius = Math.max(1, Math.min(64, Number(request.collectionRadius) || 16));
    const containerRadius = Math.max(1, Math.min(64, Number(request.containerRadius) || 16));
    const selector = request.selector ?? 'all';
    if (mode === 'inventory' && String(selector).toLowerCase() === 'all' && request.confirmed !== true) throw new Error('Depositing the full inventory requires confirmation.');
    const container = nearestStorage(bot, containerRadius);
    if (!container) throw new Error(`No chest, barrel, or shulker box was found within ${containerRadius} blocks.`);
    const drops = mode === 'nearby' ? nearbyDrops(bot, collectionRadius) : [];
    if (mode === 'nearby' && !drops.length) throw new Error(`No dropped items were found within ${collectionRadius} blocks.`);
    if (mode === 'inventory') selectedItems(bot, selector);
    const startPosition = bot.entity.position.clone();
    const lookBlock = bot.blockAtCursor?.(32);
    const lookPosition = lookBlock?.position?.offset?.(0.5, 0.5, 0.5) || null;
    const state = {
      running: true,
      mode,
      phase: 'starting',
      collected: 0,
      deposited: 0,
      failed: null,
      startPosition: positionValue(startPosition),
      containerPosition: positionValue(container.position)
    };
    let resumeMining = () => {};
    const stop = () => {
      state.running = false;
      state.phase = 'stopping';
      cancelNavigation(bot);
      if (state.window?.close) void Promise.resolve(state.window.close()).catch(() => {});
    };
    this.activities.register('stash', {
      label: 'Item stash',
      detail: mode === 'nearby' ? `Collecting ${drops.length} nearby item ${drops.length === 1 ? 'drop' : 'drops'}` : `Depositing ${selector}`,
      resources: ['movement', 'inventory'],
      stop
    });
    resumeMining = this.mining?.suspendConsistent('item collection and deposit') || (() => {});
    this.lastRun = state;
    void this.run({ bot, container, drops, mode, selector, startPosition, startYaw: bot.entity.yaw, startPitch: bot.entity.pitch, lookPosition, state })
      .catch((error) => {
        state.failed = error.message;
        if (state.running) this.logger.warn(`[Stash] ${error.message}`);
      })
      .finally(async () => {
        state.running = false;
        if (state.window?.close) {
          try { await state.window.close(); } catch {}
          state.window = null;
        }
        if (state.phase !== 'complete') {
          try {
            await this.returnToStart(bot, startPosition, state.startYaw, state.startPitch, lookPosition);
          } catch (error) {
            this.activities.stop('consistentmine');
            this.logger.warn(`[Stash] Could not fully restore the starting position, so consistent mining was stopped: ${error.message}`);
          }
        }
        resumeMining();
        this.activities.finish('stash');
        this.onChange();
      });
    this.onChange();
    return this.status();
  }

  async run({ bot, container, drops, mode, selector, startPosition, startYaw, startPitch, lookPosition, state }) {
    state.startYaw = startYaw;
    state.startPitch = startPitch;
    const before = inventoryCounts(bot);
    if (mode === 'nearby') {
      for (const entity of drops) {
        if (!state.running) return;
        if (entity.isValid === false) continue;
        state.phase = 'collecting';
        this.activities.update('stash', 'Checking nearby item drops');
        await navigateGoal(bot, new GoalNear(entity.position.x, entity.position.y, entity.position.z, 1), { description: 'a dropped item' });
        await waitForPickup(bot, entity);
      }
    }
    if (!state.running) return;
    const entries = mode === 'nearby' ? collectedItems(before, inventoryCounts(bot)) : selectedItems(bot, selector);
    if (!entries.length) throw new Error('No newly collected items reached the inventory.');
    if (mode === 'nearby') state.collected = entries.reduce((sum, entry) => sum + entry.count, 0);
    state.phase = 'depositing';
    this.activities.update('stash', `Depositing ${entries.reduce((sum, entry) => sum + entry.count, 0)} items`);
    if (bot.entity.position.distanceTo(container.position) > 4.5) {
      await navigateGoal(bot, new GoalNear(container.position.x, container.position.y, container.position.z, 3), { description: 'the nearest storage container' });
    }
    if (!state.running) return;
    const current = bot.blockAt(container.position);
    if (!isStorageBlock(current)) throw new Error('The selected storage container is no longer available.');
    await bot.lookAt(current.position.offset(0.5, 0.5, 0.5), true);
    state.window = await bot.openContainer(current);
    for (const entry of entries) {
      if (!state.running) return;
      await state.window.deposit(entry.item.type, entry.item.metadata ?? null, entry.count, entry.item.nbt ?? null);
      state.deposited += entry.count;
    }
    await state.window.close();
    state.window = null;
    state.phase = 'returning';
    this.activities.update('stash', `Deposited ${state.deposited} items; returning to ${state.startPosition.x}, ${state.startPosition.y}, ${state.startPosition.z}`);
    await this.returnToStart(bot, startPosition, startYaw, startPitch, lookPosition);
    state.phase = 'complete';
    this.logger.log(`[Stash] Deposited ${state.deposited} items and restored the starting position and view.`);
  }

  async returnToStart(bot, position, yaw, pitch, lookPosition = null) {
    if (!bot?.entity) return;
    if (bot.entity.position.distanceTo(position) > 0.8) {
      await navigateGoal(bot, new GoalNear(Math.floor(position.x), Math.floor(position.y), Math.floor(position.z), 0), { description: 'the saved position' });
    }
    if (lookPosition && typeof bot.lookAt === 'function') await bot.lookAt(lookPosition, true);
    else if (Number.isFinite(yaw) && Number.isFinite(pitch)) await bot.look(yaw, pitch, true);
  }

  stop() {
    return this.activities.stop('stash');
  }

  status() {
    if (!this.lastRun) return null;
    const { window, startYaw, startPitch, ...state } = this.lastRun;
    return { ...state };
  }
}

module.exports = { StashService, collectedItems, inventoryCounts, isStorageBlock, itemKey, nearbyDrops, nearestStorage, selectedItems, waitForPickup };
