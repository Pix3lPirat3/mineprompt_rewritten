'use strict';

const crypto = require('node:crypto');
const { GoalNear } = require('mineflayer-pathfinder').goals;
const { setImmediate: yieldEventLoop } = require('node:timers/promises');
const { serializeItem } = require('./inventory-model');
const { itemIdentity } = require('./item-identity');
const { cancelNavigation, navigateGoal } = require('./navigation-service');
const { isStorageBlock } = require('./stash-service');
const { planWithdrawal } = require('./storage-allocation');
const { normalizePosition, storageContext, storageVariant, zoneMatchesContext } = require('./storage-model');

function positionKey(position) {
  return `${Math.floor(position.x)},${Math.floor(position.y)},${Math.floor(position.z)}`;
}

function comparePositions(left, right) {
  return left.x - right.x || left.y - right.y || left.z - right.z;
}

function blockProperties(block) {
  try {
    const value = block?.getProperties?.();
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

function pairedStoragePosition(block, getBlock) {
  const position = normalizePosition(block.position);
  if (!['chest', 'trapped_chest'].includes(block.name)) return position;
  const properties = blockProperties(block);
  if (!['left', 'right'].includes(properties.type)) return position;
  const opposite = properties.type === 'left' ? 'right' : 'left';
  const candidates = [
    { x: position.x - 1, y: position.y, z: position.z },
    { x: position.x + 1, y: position.y, z: position.z },
    { x: position.x, y: position.y, z: position.z - 1 },
    { x: position.x, y: position.y, z: position.z + 1 }
  ];
  for (const candidatePosition of candidates) {
    const candidate = getBlock(candidatePosition);
    const candidateProperties = blockProperties(candidate);
    if (candidate?.name === block.name && candidateProperties.type === opposite && candidateProperties.facing === properties.facing) {
      return comparePositions(position, candidatePosition) <= 0 ? position : candidatePosition;
    }
  }
  return position;
}

function currentStorageContext(client) {
  const bot = client?.bot;
  if (!bot?.entity) return null;
  let supplied = typeof client?.storageContext === 'function' ? client.storageContext() : client?.storageContext;
  if (supplied?.server || supplied?.host) {
    try { return storageContext(supplied); } catch { return null; }
  }
  const connection = bot.lastOptions || client?.server || bot._client?.options || bot._client?.socket || {};
  const host = connection.host || connection.hostname || connection._host || connection.remoteAddress;
  if (!host) return null;
  return storageContext({
    server: { host, port: connection.port || connection.remotePort || 25565 },
    dimension: bot.game?.dimension || bot.entity.dimension || 'overworld'
  });
}

function itemRecord(item, client) {
  const variant = storageVariant(item);
  const serialized = serializeItem(item, -1, -1, client?.chatMessageClass || null, client?.bot?.registry || null);
  return {
    variantId: variant.id,
    identity: variant.identity,
    name: String(serialized.name || item.name || 'unknown'),
    displayName: String(serialized.displayName || item.displayName || item.name || 'Unknown'),
    count: Math.max(0, Number(item.count) || 0),
    metadata: Number(item.metadata) || 0,
    stackSize: Math.max(1, Number(item.stackSize) || 64),
    maxDurability: serialized.maxDurability,
    durabilityRemaining: serialized.durabilityRemaining,
    enchanted: serialized.enchanted,
    enchantments: serialized.enchantments,
    customName: serialized.customName,
    lore: serialized.lore,
    slots: Number.isInteger(item.slot) ? [{ slot: item.slot, count: Math.max(0, Number(item.count) || 0) }] : []
  };
}

function publicItem(record) {
  const { identity, slots, ...value } = record;
  return value;
}

function mergeItem(target, record) {
  const current = target.get(record.identity);
  if (current) {
    current.count += record.count;
    current.slots.push(...record.slots);
  }
  else target.set(record.identity, { ...record, slots: record.slots.map((slot) => ({ ...slot })) });
}

function inventoryIdentityCount(bot, identity) {
  return (bot.inventory?.items?.() || []).reduce((sum, item) => sum + (itemIdentity(item) === identity ? Number(item.count) || 0 : 0), 0);
}

function publicScan(state, stale) {
  if (!state) return null;
  return {
    zoneId: state.zoneId,
    zoneName: state.zoneName,
    running: state.running,
    phase: state.phase,
    stale,
    complete: state.complete,
    scannedAt: state.scannedAt,
    containersFound: state.containersFound,
    containersScanned: state.containersScanned,
    unknownBlocks: state.unknownBlocks,
    failures: state.failures.map((failure) => ({ ...failure })),
    items: [...state.items.values()].map(publicItem).sort((left, right) => left.displayName.localeCompare(right.displayName) || left.variantId.localeCompare(right.variantId)),
    containers: state.containers.map((container) => ({
      ...container,
      position: { ...container.position },
      items: container.items.map(publicItem)
    }))
  };
}

class StorageService {
  constructor({ getClient, store, activities, logger, onChange = () => {}, staleAfterMs = 300000, owner = crypto.randomUUID() }) {
    this.getClient = getClient;
    this.store = store;
    this.activities = activities;
    this.logger = logger;
    this.onChange = onChange;
    this.staleAfterMs = Math.max(1000, Number(staleAfterMs) || 300000);
    this.owner = String(owner);
    this.scans = new Map();
    this.active = null;
    this.operation = null;
  }

  get client() {
    return this.getClient();
  }

  get bot() {
    return this.client?.bot || null;
  }

  context() {
    return currentStorageContext(this.client);
  }

  zones({ all = false } = {}) {
    const zones = this.store.snapshot().storageZones || [];
    const context = this.context();
    return zones.filter((zone) => all || context && zoneMatchesContext(zone, context)).map((zone) => ({
      ...zone,
      from: { ...zone.from },
      to: { ...zone.to },
      scan: this.scanSnapshot(zone)
    }));
  }

  resolveZone(reference) {
    const target = String(reference || '').trim().toLowerCase();
    if (!target) throw new Error('A storage zone id or name is required.');
    const zones = this.store.snapshot().storageZones || [];
    const zone = zones.find((entry) => entry.id.toLowerCase() === target) || zones.find((entry) => entry.name.toLowerCase() === target);
    if (!zone) throw new Error(`Storage zone ${reference} was not found.`);
    const context = this.context();
    if (context && !zoneMatchesContext(zone, context)) throw new Error(`${zone.name} belongs to another server or dimension.`);
    return zone;
  }

  async saveZone(input = {}) {
    const context = this.context();
    const server = input.server || context?.server;
    const dimension = input.dimension || context?.dimension;
    if (!server || !dimension) throw new Error('Connect a bot or provide a server and dimension.');
    const zone = await this.store.saveStorageZone({ ...input, server, dimension });
    this.scans.delete(zone.id);
    this.onChange();
    return zone;
  }

  async removeZone(reference) {
    const zone = this.resolveZone(reference);
    if (this.active?.zoneId === zone.id) this.stop();
    const removed = await this.store.removeStorageZone(zone.id);
    this.scans.delete(zone.id);
    this.onChange();
    return removed;
  }

  scanSnapshot(zone) {
    const state = this.scans.get(zone.id);
    if (!state) return null;
    const context = this.context();
    const currentRevision = Number(this.client?.inventoryEvents?.revision);
    const revisionChanged = Number.isInteger(state.inventoryRevision) && Number.isInteger(currentRevision) && state.inventoryRevision !== currentRevision;
    const expired = Number.isFinite(state.scannedAt) && Date.now() - state.scannedAt > this.staleAfterMs;
    const stale = !context || !zoneMatchesContext(zone, context) || state.connectionId !== this.client?.connectionAttempt || state.zoneUpdatedAt !== zone.updatedAt || revisionChanged || expired;
    return publicScan(state, stale);
  }

  inspect(reference) {
    const zone = this.resolveZone(reference);
    return { zone: { ...zone, from: { ...zone.from }, to: { ...zone.to } }, scan: this.scanSnapshot(zone) };
  }

  find(selector, options = {}) {
    const query = String(selector || '').trim().toLowerCase();
    if (!query) throw new Error('An item name is required.');
    const zones = options.zone ? [this.resolveZone(options.zone)] : this.zones().map((zone) => this.resolveZone(zone.id));
    const minimum = Math.max(0, Number(options.minimum) || 0);
    const results = [];
    for (const zone of zones) {
      const scan = this.scanSnapshot(zone);
      if (!scan) continue;
      for (const item of scan.items) {
        if (![item.name, item.displayName, item.variantId].some((value) => String(value || '').toLowerCase().includes(query))) continue;
        if (item.count < minimum) continue;
        results.push({ zoneId: zone.id, zoneName: zone.name, stale: scan.stale, scannedAt: scan.scannedAt, ...item });
      }
    }
    return results.sort((left, right) => right.count - left.count || left.zoneName.localeCompare(right.zoneName));
  }

  async planFetch(request = {}) {
    const bot = this.bot;
    if (!bot?.entity) throw new Error('An active connection is required.');
    const zone = this.resolveZone(request.zone);
    const state = this.scans.get(zone.id);
    const scan = this.scanSnapshot(zone);
    if (!state || !scan) throw new Error(`${zone.name} must be scanned before fetching items.`);
    const reservations = await this.store.storageReservationSnapshot({ prefix: `withdraw:${zone.id}:` });
    return planWithdrawal({
      zoneId: zone.id,
      scan: { ...state, stale: scan.stale },
      selector: request.item,
      count: request.count,
      origin: bot.entity.position,
      reservations,
      beamWidth: request.beamWidth
    });
  }

  publicFetchPlan(plan) {
    return {
      zoneId: plan.zoneId,
      variant: { variantId: plan.variant.variantId, name: plan.variant.name, displayName: plan.variant.displayName },
      requested: plan.requested,
      available: plan.available,
      estimatedCost: plan.estimatedCost,
      allocations: plan.allocations.map((entry) => ({ position: { ...entry.position }, count: entry.count, available: entry.available }))
    };
  }

  async fetchPlan(request = {}) {
    return this.publicFetchPlan(await this.planFetch(request));
  }

  async startFetch(request = {}) {
    const bot = this.bot;
    if (!bot?.entity) throw new Error('An active connection is required.');
    if (bot.currentWindow) throw new Error('Close the current container before fetching storage items.');
    if (this.active || this.operation?.running || this.activities.has('storage-transfer')) throw new Error('A storage operation is already active.');
    const plan = await this.planFetch(request);
    const lease = await this.store.reserveStorage({ owner: this.owner, ttlMs: 120000, entries: plan.reservationEntries });
    const startPosition = bot.entity.position.clone();
    const lookBlock = bot.blockAtCursor?.(32);
    const lookPosition = lookBlock?.position?.offset?.(0.5, 0.5, 0.5) || null;
    const state = {
      kind: 'fetch',
      running: true,
      phase: 'reserved',
      zoneId: plan.zoneId,
      variantId: plan.variant.variantId,
      displayName: plan.variant.displayName,
      requested: plan.requested,
      transferred: 0,
      containersPlanned: plan.allocations.length,
      containersVisited: 0,
      startPosition: normalizePosition(startPosition),
      failed: null,
      returned: false,
      settled: false,
      window: null,
      leaseId: lease.id
    };
    const stop = () => {
      state.running = false;
      state.phase = 'stopping';
      cancelNavigation(bot);
      if (state.window?.close) void Promise.resolve(state.window.close()).catch(() => {});
    };
    try {
      this.activities.register('storage-transfer', {
        label: 'Storage fetch',
        detail: `Fetching ${plan.requested} x ${plan.variant.displayName}`,
        resources: ['movement', 'inventory'],
        stop
      });
    } catch (error) {
      await Promise.resolve(this.store.releaseStorageReservation(lease.id, this.owner)).catch(() => false);
      throw error;
    }
    this.operation = state;
    void this.runFetch({ bot, plan, state, startPosition, startYaw: bot.entity.yaw, startPitch: bot.entity.pitch, lookPosition })
      .catch((error) => {
        state.failed = error.message;
        state.phase = 'failed';
        if (state.running) this.logger.warn(`[Storage] ${error.message}`);
      })
      .finally(async () => {
        state.running = false;
        if (state.window?.close) {
          try { await state.window.close(); } catch {}
          state.window = null;
        }
        if (!state.returned) {
          try {
            await this.returnToStart(bot, startPosition, state.startYaw, state.startPitch, lookPosition);
            state.returned = true;
          } catch (error) {
            if (!state.failed) state.failed = error.message;
            this.logger.warn(`[Storage] Could not restore the starting position: ${error.message}`);
          }
        }
        await Promise.resolve(this.store.releaseStorageReservation(lease.id, this.owner)).catch(() => false);
        this.activities.finish('storage-transfer');
        state.settled = true;
        this.onChange();
      });
    this.onChange();
    return this.operationStatus();
  }

  async runFetch({ bot, plan, state, startPosition, startYaw, startPitch, lookPosition }) {
    state.startYaw = startYaw;
    state.startPitch = startPitch;
    const inventoryBefore = inventoryIdentityCount(bot, plan.variant.identity);
    for (const allocation of plan.allocations) {
      if (!state.running) return;
      state.phase = 'navigating';
      this.activities.update('storage-transfer', `Fetching ${state.transferred}/${state.requested} x ${state.displayName}`);
      if (bot.entity.position.distanceTo(allocation.position) > 4.5) {
        await navigateGoal(bot, new GoalNear(allocation.position.x, allocation.position.y, allocation.position.z, 3), { description: 'a reserved storage container' });
      }
      if (!state.running) return;
      const block = bot.blockAt(allocation.position);
      if (!isStorageBlock(block)) throw new Error('A reserved storage container is no longer available.');
      await bot.lookAt(block.position.offset(0.5, 0.5, 0.5), true);
      state.phase = 'withdrawing';
      state.window = await bot.openContainer(block);
      const matching = (state.window.containerItems?.() || []).filter((item) => itemIdentity(item) === plan.variant.identity);
      const liveAvailable = matching.reduce((sum, item) => sum + (Number(item.count) || 0), 0);
      if (liveAvailable < allocation.count) throw new Error(`A reserved container now has only ${liveAvailable} matching ${state.displayName}.`);
      let remaining = allocation.count;
      for (const item of matching) {
        if (!remaining || !state.running) break;
        const count = Math.min(remaining, Number(item.count) || 0);
        await bot.transfer({
          window: state.window,
          itemType: item.type,
          metadata: item.metadata,
          nbt: item.nbt,
          count,
          sourceStart: item.slot,
          sourceEnd: item.slot + 1,
          destStart: state.window.inventoryStart,
          destEnd: state.window.inventoryEnd
        });
        remaining -= count;
        state.transferred += count;
      }
      if (remaining) throw new Error(`Could not withdraw ${remaining} reserved ${state.displayName}.`);
      await state.window.close();
      state.window = null;
      state.containersVisited += 1;
      await this.store.renewStorageReservation(state.leaseId, this.owner, 120000);
      if (typeof bot.waitForTicks === 'function') await bot.waitForTicks(1);
    }
    if (!state.running) return;
    const inventoryAfter = inventoryIdentityCount(bot, plan.variant.identity);
    if (inventoryAfter - inventoryBefore < plan.requested) throw new Error(`Inventory verification found only ${Math.max(0, inventoryAfter - inventoryBefore)} of ${plan.requested} fetched ${state.displayName}.`);
    state.phase = 'returning';
    this.activities.update('storage-transfer', `Fetched ${state.transferred} items; returning to ${state.startPosition.x}, ${state.startPosition.y}, ${state.startPosition.z}`);
    await this.returnToStart(bot, startPosition, startYaw, startPitch, lookPosition);
    state.returned = true;
    state.phase = 'complete';
    this.logger.log(`[Storage] Fetched ${state.transferred} x ${state.displayName} and restored the starting position and view.`);
  }

  async returnToStart(bot, position, yaw, pitch, lookPosition = null) {
    if (!bot?.entity) return;
    if (bot.entity.position.distanceTo(position) > 0.8) {
      await navigateGoal(bot, new GoalNear(Math.floor(position.x), Math.floor(position.y), Math.floor(position.z), 0), { description: 'the saved position' });
    }
    if (lookPosition && typeof bot.lookAt === 'function') await bot.lookAt(lookPosition, true);
    else if (Number.isFinite(yaw) && Number.isFinite(pitch)) await bot.look(yaw, pitch, true);
  }

  start(reference) {
    const bot = this.bot;
    if (!bot?.entity) throw new Error('An active connection is required.');
    if (bot.currentWindow) throw new Error('Close the current container before scanning storage.');
    if (this.active || this.operation?.running) throw new Error('A storage operation is already active.');
    const zone = this.resolveZone(reference);
    const context = this.context();
    if (!zoneMatchesContext(zone, context)) throw new Error(`${zone.name} belongs to another server or dimension.`);
    const state = {
      zoneId: zone.id,
      zoneName: zone.name,
      zoneUpdatedAt: zone.updatedAt,
      connectionId: this.client.connectionAttempt,
      inventoryRevision: null,
      running: true,
      phase: 'discovering',
      complete: false,
      scannedAt: null,
      containersFound: 0,
      containersScanned: 0,
      unknownBlocks: 0,
      failures: [],
      items: new Map(),
      containers: [],
      window: null
    };
    const stop = () => {
      state.running = false;
      state.phase = 'stopping';
      cancelNavigation(bot);
      if (state.window?.close) void Promise.resolve(state.window.close()).catch(() => {});
    };
    this.activities.register('storage-scan', {
      label: 'Storage scan',
      detail: `Discovering containers in ${zone.name}`,
      resources: ['movement', 'inventory'],
      stop
    });
    this.active = state;
    this.scans.set(zone.id, state);
    void this.run(zone, state).catch((error) => {
      if (state.running) {
        state.phase = 'failed';
        state.failures.push({ position: null, message: error.message });
        this.logger.warn(`[Storage] ${error.message}`);
      }
    }).finally(async () => {
      state.running = false;
      if (state.window?.close) {
        try { await state.window.close(); } catch {}
        state.window = null;
      }
      if (this.active === state) this.active = null;
      this.activities.finish('storage-scan');
      this.onChange();
    });
    this.onChange();
    return this.scanSnapshot(zone);
  }

  async discover(zone, state) {
    const bot = this.bot;
    const containers = new Map();
    let visited = 0;
    for (let x = zone.from.x; x <= zone.to.x && state.running; x += 1) {
      for (let y = zone.from.y; y <= zone.to.y && state.running; y += 1) {
        for (let z = zone.from.z; z <= zone.to.z && state.running; z += 1) {
          visited += 1;
          if (visited % 4096 === 0) await yieldEventLoop();
          const block = bot.blockAt({ x, y, z });
          if (!block) {
            state.unknownBlocks += 1;
            continue;
          }
          if (!isStorageBlock(block)) continue;
          const position = pairedStoragePosition(block, (value) => bot.blockAt(value));
          if (!containers.has(positionKey(position))) containers.set(positionKey(position), position);
        }
      }
    }
    return [...containers.values()];
  }

  async run(zone, state) {
    const bot = this.bot;
    const positions = await this.discover(zone, state);
    state.containersFound = positions.length;
    if (!state.running) return;
    state.phase = 'scanning';
    for (let index = 0; positions.length && state.running; index += 1) {
      let nearest = 0;
      for (let candidate = 1; candidate < positions.length; candidate += 1) {
        if (bot.entity.position.distanceTo(positions[candidate]) < bot.entity.position.distanceTo(positions[nearest])) nearest = candidate;
      }
      const [position] = positions.splice(nearest, 1);
      this.activities.update('storage-scan', `Scanning ${index + 1} of ${state.containersFound} containers in ${zone.name}`);
      try {
        await this.scanContainer(position, state);
      } catch (error) {
        state.failures.push({ position: { ...position }, message: error.message });
      }
    }
    if (!state.running) return;
    state.phase = 'complete';
    state.complete = state.failures.length === 0 && state.unknownBlocks === 0;
    state.scannedAt = Date.now();
    const revision = Number(this.client?.inventoryEvents?.revision);
    state.inventoryRevision = Number.isInteger(revision) ? revision : null;
    this.logger.log(`[Storage] Scanned ${state.containersScanned} of ${state.containersFound} containers in ${zone.name}.`);
  }

  async scanContainer(position, state) {
    const bot = this.bot;
    if (bot.entity.position.distanceTo(position) > 4.5) {
      await navigateGoal(bot, new GoalNear(position.x, position.y, position.z, 3), { description: 'a storage container' });
    }
    if (!state.running) return;
    const block = bot.blockAt(position);
    if (!isStorageBlock(block)) throw new Error('The storage container is no longer available.');
    await bot.lookAt(block.position.offset(0.5, 0.5, 0.5), true);
    state.window = await bot.openContainer(block);
    const grouped = new Map();
    for (const item of state.window.containerItems?.() || []) {
      const record = itemRecord(item, this.client);
      mergeItem(grouped, record);
      mergeItem(state.items, record);
    }
    const items = [...grouped.values()].sort((left, right) => left.displayName.localeCompare(right.displayName) || left.variantId.localeCompare(right.variantId));
    const occupiedSlots = (state.window.containerItems?.() || []).length;
    state.containers.push({
      position: normalizePosition(position),
      block: block.name,
      slotCount: Math.max(0, Number(state.window.inventoryStart) || 0),
      freeSlots: Math.max(0, (Number(state.window.inventoryStart) || 0) - occupiedSlots),
      itemCount: items.reduce((sum, item) => sum + item.count, 0),
      items
    });
    state.containersScanned += 1;
    await state.window.close();
    state.window = null;
    if (typeof bot.waitForTicks === 'function') await bot.waitForTicks(1);
  }

  stop() {
    return this.activities.stop('storage-transfer') || this.activities.stop('storage-scan');
  }

  operationStatus() {
    if (!this.operation) return null;
    const { window, leaseId, startYaw, startPitch, ...state } = this.operation;
    return { ...state };
  }

  status() {
    if (!this.active) return null;
    const zone = (this.store.snapshot().storageZones || []).find((entry) => entry.id === this.active.zoneId);
    return zone ? this.scanSnapshot(zone) : null;
  }

  snapshot() {
    return { active: this.status(), zones: this.zones() };
  }

  summary() {
    const summarize = (scan) => scan ? {
      zoneId: scan.zoneId,
      running: scan.running,
      phase: scan.phase,
      stale: scan.stale,
      complete: scan.complete,
      scannedAt: scan.scannedAt,
      containersFound: scan.containersFound,
      containersScanned: scan.containersScanned,
      unknownBlocks: scan.unknownBlocks,
      failureCount: scan.failures.length,
      variantCount: scan.items.length,
      itemCount: scan.items.reduce((sum, item) => sum + item.count, 0)
    } : null;
    return {
      active: summarize(this.status()),
      operation: this.operationStatus(),
      zones: this.zones().map(({ scan, ...zone }) => ({ ...zone, scan: summarize(scan) }))
    };
  }
}

module.exports = {
  StorageService,
  blockProperties,
  currentStorageContext,
  inventoryIdentityCount,
  itemRecord,
  pairedStoragePosition,
  positionKey,
  publicScan
};
