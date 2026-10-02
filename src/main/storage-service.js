'use strict';

const crypto = require('node:crypto');
const { GoalNear } = require('mineflayer-pathfinder').goals;
const { setImmediate: yieldEventLoop } = require('node:timers/promises');
const { serializeItem } = require('./inventory-model');
const { itemIdentity } = require('./item-identity');
const { cancelNavigation, navigateGoal } = require('./navigation-service');
const { isStorageBlock } = require('./stash-service');
const { containerCategory, planDeposit: planDepositAllocation, planWithdrawal } = require('./storage-allocation');
const { categoryId, normalizePosition, storageContext, storageVariant, zoneMatchesContext } = require('./storage-model');

const MAX_STORAGE_AUDIT_CONTAINERS = 512;
const MAX_STORAGE_AUDIT_ISSUES = 1024;

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

function depositInventory(bot, client) {
  const items = new Map();
  for (const item of bot.inventory?.items?.() || []) {
    if (!Number.isInteger(item.slot) || item.slot < 9 || item.slot > 44) continue;
    mergeItem(items, itemRecord(item, client));
  }
  return items;
}

function windowInventoryItems(window) {
  if (Array.isArray(window?.slots)) {
    return window.slots.slice(window.inventoryStart, window.inventoryEnd).filter(Boolean);
  }
  return (window?.items?.() || []).filter((item) => item.slot >= window.inventoryStart && item.slot < window.inventoryEnd);
}

function groupedItemRecords(items, client) {
  const grouped = new Map();
  for (const item of items || []) mergeItem(grouped, itemRecord(item, client));
  return grouped;
}

function auditContainer(indexed, liveItems, zone, client) {
  const issues = [];
  const live = groupedItemRecords(liveItems, client);
  const expected = new Map(indexed.items.map((item) => [item.identity, item]));
  const identities = new Set([...expected.keys(), ...live.keys()]);
  for (const identity of identities) {
    const before = expected.get(identity);
    const after = live.get(identity);
    const expectedCount = before?.count || 0;
    const actualCount = after?.count || 0;
    const item = after || before;
    if (expectedCount !== actualCount) issues.push({
      severity: 'error',
      code: 'stock-changed',
      position: { ...indexed.position },
      variantId: item.variantId,
      displayName: item.displayName,
      expected: expectedCount,
      actual: actualCount,
      message: `${item.displayName} changed from ${expectedCount} to ${actualCount}.`
    });
    const partialStacks = (after?.slots || []).filter((slot) => slot.count < after.stackSize).length;
    if (partialStacks > 1) issues.push({
      severity: 'warning',
      code: 'fragmented-stacks',
      position: { ...indexed.position },
      variantId: after.variantId,
      displayName: after.displayName,
      expected: 1,
      actual: partialStacks,
      message: `${after.displayName} occupies ${partialStacks} partial stacks.`
    });
  }
  const category = containerCategory(zone, indexed.position, indexed.categoryId);
  if (category && !category.overflow && category.items.length) {
    const selectors = new Set(category.items);
    for (const item of live.values()) {
      const keys = [item.variantId, item.name, item.displayName].map((entry) => String(entry || '').toLowerCase());
      if (keys.some((entry) => selectors.has(entry))) continue;
      issues.push({
        severity: 'warning',
        code: 'category-mismatch',
        position: { ...indexed.position },
        variantId: item.variantId,
        displayName: item.displayName,
        expected: category.id,
        actual: null,
        message: `${item.displayName} does not match category ${category.name}.`
      });
    }
  }
  return issues;
}

function applyScanCategories(state, zone, bot) {
  if (!state) return;
  state.containerCategories.clear();
  for (const container of state.containers) container.categoryId = containerCategory(zone, container.position)?.id || null;
  for (const category of zone.categories || []) {
    for (const assigned of category.containers) {
      const block = bot?.blockAt?.(assigned);
      const position = isStorageBlock(block) ? pairedStoragePosition(block, (value) => bot.blockAt(value)) : assigned;
      const key = positionKey(position);
      state.containerCategories.set(key, category.id);
      const container = state.containers.find((entry) => positionKey(entry.position) === key);
      if (container) container.categoryId = category.id;
    }
  }
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
    this.operationPromise = null;
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

  categories(reference) {
    const zone = this.resolveZone(reference);
    return (zone.categories || []).map((category) => ({ ...category, items: [...category.items], containers: category.containers.map((position) => ({ ...position })) }));
  }

  async saveCategory(reference, input = {}) {
    const zone = this.resolveZone(reference);
    const lookup = String(input.id || input.name || '').trim().toLowerCase();
    const existingCategories = zone.categories || [];
    const current = existingCategories.find((entry) => entry.id.toLowerCase() === lookup || entry.name.toLowerCase() === lookup);
    const name = String(input.name || current?.name || '').trim();
    if (!name) throw new Error('A storage category name is required.');
    const category = {
      id: current?.id || categoryId(input.id || name),
      name,
      items: input.items === undefined ? current?.items || [] : input.items,
      containers: input.containers === undefined ? current?.containers || [] : input.containers,
      overflow: input.overflow === undefined ? current?.overflow === true : input.overflow === true
    };
    const categories = current ? existingCategories.map((entry) => entry.id === current.id ? category : entry) : [...existingCategories, category];
    const saved = await this.store.saveStorageZone({ ...zone, categories });
    const state = this.scans.get(zone.id);
    if (state) {
      state.zoneUpdatedAt = saved.updatedAt;
      applyScanCategories(state, saved, this.bot);
    }
    this.onChange();
    return saved.categories.find((entry) => entry.id === category.id);
  }

  async removeCategory(reference, categoryReference) {
    const zone = this.resolveZone(reference);
    const target = String(categoryReference || '').trim().toLowerCase();
    const existingCategories = zone.categories || [];
    const categories = existingCategories.filter((entry) => entry.id.toLowerCase() !== target && entry.name.toLowerCase() !== target);
    if (categories.length === existingCategories.length) return false;
    const saved = await this.store.saveStorageZone({ ...zone, categories });
    const state = this.scans.get(zone.id);
    if (state) {
      state.zoneUpdatedAt = saved.updatedAt;
      applyScanCategories(state, saved, this.bot);
    }
    this.onChange();
    return true;
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

  async planDeposit(request = {}) {
    const bot = this.bot;
    if (!bot?.entity) throw new Error('An active connection is required.');
    const zone = this.resolveZone(request.zone);
    const state = this.scans.get(zone.id);
    const scan = this.scanSnapshot(zone);
    if (!state || !scan) throw new Error(`${zone.name} must be scanned before depositing items.`);
    const reservations = await this.store.storageReservationSnapshot({ prefix: `deposit:${zone.id}:` });
    return planDepositAllocation({
      zone,
      scan: { ...state, stale: scan.stale },
      inventory: depositInventory(bot, this.client),
      selector: request.item,
      slot: request.slot,
      count: request.count,
      category: request.category,
      origin: bot.entity.position,
      reservations,
      beamWidth: request.beamWidth
    });
  }

  publicDepositPlan(plan) {
    return {
      zoneId: plan.zoneId,
      category: plan.category,
      variant: { variantId: plan.variant.variantId, name: plan.variant.name, displayName: plan.variant.displayName },
      requested: plan.requested,
      available: plan.available,
      estimatedCost: plan.estimatedCost,
      allocations: plan.allocations.map((entry) => ({
        position: { ...entry.position },
        count: entry.count,
        destinations: entry.slots.map((destination) => ({ slot: destination.slot, count: destination.count, kind: destination.kind, priority: destination.tier }))
      }))
    };
  }

  async depositPlan(request = {}) {
    return this.publicDepositPlan(await this.planDeposit(request));
  }

  startAudit(reference) {
    const bot = this.bot;
    if (!bot?.entity) throw new Error('An active connection is required.');
    if (bot.currentWindow) throw new Error('Close the current container before auditing storage.');
    if (this.active || this.operation?.running || this.activities.has('storage-audit') || this.activities.has('storage-transfer')) throw new Error('A storage operation is already active.');
    const zone = this.resolveZone(reference);
    const scan = this.scans.get(zone.id);
    if (!scan?.complete) throw new Error(`${zone.name} requires a complete scan before it can be audited.`);
    if (scan.containers.length > MAX_STORAGE_AUDIT_CONTAINERS) throw new Error(`Storage audits cannot visit more than ${MAX_STORAGE_AUDIT_CONTAINERS} containers.`);
    const startPosition = bot.entity.position.clone();
    const lookBlock = bot.blockAtCursor?.(32);
    const lookPosition = lookBlock?.position?.offset?.(0.5, 0.5, 0.5) || null;
    const state = {
      kind: 'audit',
      running: true,
      phase: 'starting',
      zoneId: zone.id,
      zoneName: zone.name,
      containersPlanned: scan.containers.length,
      containersVisited: 0,
      issueCount: 0,
      errorCount: 0,
      warningCount: 0,
      omittedIssues: 0,
      issues: [],
      startPosition: normalizePosition(startPosition),
      failed: null,
      returned: false,
      settled: false,
      window: null,
      startYaw: bot.entity.yaw,
      startPitch: bot.entity.pitch
    };
    const stop = () => {
      state.running = false;
      state.phase = 'stopping';
      cancelNavigation(bot);
      if (state.window?.close) void Promise.resolve(state.window.close()).catch(() => {});
    };
    this.activities.register('storage-audit', {
      label: 'Storage audit',
      detail: `Auditing ${zone.name}`,
      resources: ['movement', 'inventory'],
      stop
    });
    this.operation = state;
    const operationPromise = this.runAudit({ bot, zone, scan, state, startPosition, lookPosition }).catch((error) => {
      state.failed = error.message;
      state.phase = 'failed';
      if (state.running) this.logger.warn(`[Storage] ${error.message}`);
    }).finally(async () => {
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
      this.activities.finish('storage-audit');
      state.settled = true;
      this.onChange();
    });
    this.operationPromise = operationPromise;
    void operationPromise;
    this.onChange();
    return this.operationStatus();
  }

  recordAuditIssue(state, issue) {
    state.issueCount += 1;
    if (issue.severity === 'error') state.errorCount += 1;
    else state.warningCount += 1;
    if (state.issues.length < MAX_STORAGE_AUDIT_ISSUES) state.issues.push(issue);
    else state.omittedIssues += 1;
  }

  async runAudit({ bot, zone, scan, state, startPosition, lookPosition }) {
    for (const indexed of scan.containers) {
      if (!state.running) return;
      try {
        await this.auditOneContainer({ bot, zone, indexed, state });
      } catch (error) {
        if (!state.running) return;
        this.recordAuditIssue(state, { severity: 'error', code: 'container-inaccessible', position: { ...indexed.position }, variantId: null, displayName: null, expected: indexed.block, actual: null, message: error.message });
      } finally {
        if (state.window?.close) {
          try { await state.window.close(); } catch {}
          state.window = null;
        }
        state.containersVisited += 1;
      }
      if (typeof bot.waitForTicks === 'function') await bot.waitForTicks(1);
    }
    if (!state.running) return;
    state.phase = 'returning';
    await this.returnToStart(bot, startPosition, state.startYaw, state.startPitch, lookPosition);
    state.returned = true;
    state.phase = 'complete';
    this.logger.log(`[Storage] Audited ${state.containersVisited} containers in ${zone.name}: ${state.errorCount} errors and ${state.warningCount} warnings.`);
  }

  async auditOneContainer({ bot, zone, indexed, state }) {
    state.phase = 'navigating';
    this.activities.update('storage-audit', `Auditing ${state.containersVisited}/${state.containersPlanned} containers in ${zone.name}`);
    if (bot.entity.position.distanceTo(indexed.position) > 4.5) {
      await navigateGoal(bot, new GoalNear(indexed.position.x, indexed.position.y, indexed.position.z, 3), { description: 'an indexed storage container' });
    }
    if (!state.running) return;
    const block = bot.blockAt(indexed.position);
    if (!isStorageBlock(block)) {
      this.recordAuditIssue(state, { severity: 'error', code: 'container-missing', position: { ...indexed.position }, variantId: null, displayName: null, expected: indexed.block, actual: block?.name || null, message: 'The indexed storage container is no longer available.' });
      return;
    }
    await bot.lookAt(block.position.offset(0.5, 0.5, 0.5), true);
    state.phase = 'inspecting';
    state.window = await bot.openContainer(block);
    if (!state.running) return;
    const liveSlotCount = Math.max(0, Number(state.window.inventoryStart) || 0);
    if (liveSlotCount !== indexed.slotCount) this.recordAuditIssue(state, { severity: 'error', code: 'capacity-changed', position: { ...indexed.position }, variantId: null, displayName: null, expected: indexed.slotCount, actual: liveSlotCount, message: `Container capacity changed from ${indexed.slotCount} to ${liveSlotCount} slots.` });
    for (const issue of auditContainer(indexed, state.window.containerItems?.() || [], zone, this.client)) this.recordAuditIssue(state, issue);
  }

  async startFetch(request = {}) {
    const bot = this.bot;
    if (!bot?.entity) throw new Error('An active connection is required.');
    if (bot.currentWindow) throw new Error('Close the current container before fetching storage items.');
    if (this.active || this.operation?.running || this.activities.has('storage-transfer')) throw new Error('A storage operation is already active.');
    const plan = await this.planFetch(request);
    return this.startTransfer({
      bot,
      plan,
      kind: 'fetch',
      label: 'Storage fetch',
      detail: `Fetching ${plan.requested} x ${plan.variant.displayName}`,
      parentActivity: request.parentActivity,
      run: (context) => this.runFetch(context)
    });
  }

  async startDeposit(request = {}) {
    const bot = this.bot;
    if (!bot?.entity) throw new Error('An active connection is required.');
    if (bot.currentWindow) throw new Error('Close the current container before depositing storage items.');
    if (this.active || this.operation?.running || this.activities.has('storage-transfer')) throw new Error('A storage operation is already active.');
    const plan = await this.planDeposit(request);
    return this.startTransfer({
      bot,
      plan,
      kind: 'deposit',
      label: 'Storage deposit',
      detail: `Depositing ${plan.requested} x ${plan.variant.displayName}`,
      parentActivity: request.parentActivity,
      run: (context) => this.runDeposit(context)
    });
  }

  async startTransfer({ bot, plan, kind, label, detail, parentActivity = null, run }) {
    const lease = await this.store.reserveStorage({ owner: this.owner, ttlMs: 120000, entries: plan.reservationEntries });
    const startPosition = bot.entity.position.clone();
    const lookBlock = bot.blockAtCursor?.(32);
    const lookPosition = lookBlock?.position?.offset?.(0.5, 0.5, 0.5) || null;
    const state = {
      kind,
      running: true,
      phase: 'reserved',
      zoneId: plan.zoneId,
      category: plan.category || null,
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
        label,
        detail,
        resources: ['movement', 'inventory'],
        parent: parentActivity,
        stop
      });
    } catch (error) {
      await Promise.resolve(this.store.releaseStorageReservation(lease.id, this.owner)).catch(() => false);
      throw error;
    }
    this.operation = state;
    const operationPromise = run({ bot, plan, state, startPosition, startYaw: bot.entity.yaw, startPitch: bot.entity.pitch, lookPosition })
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
    this.operationPromise = operationPromise;
    void operationPromise;
    this.onChange();
    return this.operationStatus();
  }

  async waitForOperation() {
    if (this.operationPromise) await this.operationPromise;
    return this.operationStatus();
  }

  waitForTransfer() {
    return this.waitForOperation();
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

  async runDeposit({ bot, plan, state, startPosition, startYaw, startPitch, lookPosition }) {
    state.startYaw = startYaw;
    state.startPitch = startPitch;
    const inventoryBefore = inventoryIdentityCount(bot, plan.variant.identity);
    for (const allocation of plan.allocations) {
      if (!state.running) return;
      state.phase = 'navigating';
      this.activities.update('storage-transfer', `Depositing ${state.transferred}/${state.requested} x ${state.displayName}`);
      if (bot.entity.position.distanceTo(allocation.position) > 4.5) {
        await navigateGoal(bot, new GoalNear(allocation.position.x, allocation.position.y, allocation.position.z, 3), { description: 'a reserved storage container' });
      }
      if (!state.running) return;
      const block = bot.blockAt(allocation.position);
      if (!isStorageBlock(block)) throw new Error('A reserved storage container is no longer available.');
      await bot.lookAt(block.position.offset(0.5, 0.5, 0.5), true);
      state.phase = 'depositing';
      state.window = await bot.openContainer(block);
      for (const destination of allocation.slots) {
        if (!state.running) return;
        const current = (state.window.containerItems?.() || []).find((item) => item.slot === destination.slot) || null;
        if (destination.kind === 'empty' && current) throw new Error(`Reserved destination slot ${destination.slot} is no longer empty.`);
        if (destination.kind === 'partial') {
          if (!current || itemIdentity(current) !== plan.variant.identity) throw new Error(`Reserved destination slot ${destination.slot} no longer contains matching ${state.displayName}.`);
          if (Math.max(0, plan.variant.stackSize - (Number(current.count) || 0)) < destination.count) throw new Error(`Reserved destination slot ${destination.slot} no longer has enough capacity.`);
        }
        let remaining = destination.count;
        while (remaining && state.running) {
          const source = windowInventoryItems(state.window).find((item) => itemIdentity(item) === plan.variant.identity);
          if (!source) throw new Error(`The inventory no longer contains enough matching ${state.displayName}.`);
          const transferred = Math.min(remaining, Number(source.count) || 0);
          if (!transferred) throw new Error(`A matching ${state.displayName} stack has no transferable items.`);
          await bot.transfer({
            window: state.window,
            itemType: source.type,
            metadata: source.metadata,
            nbt: source.nbt,
            count: transferred,
            sourceStart: source.slot,
            sourceEnd: source.slot + 1,
            destStart: destination.slot,
            destEnd: destination.slot + 1
          });
          remaining -= transferred;
          state.transferred += transferred;
        }
        if (remaining) return;
      }
      await state.window.close();
      state.window = null;
      state.containersVisited += 1;
      await this.store.renewStorageReservation(state.leaseId, this.owner, 120000);
      if (typeof bot.waitForTicks === 'function') await bot.waitForTicks(1);
    }
    if (!state.running) return;
    const inventoryAfter = inventoryIdentityCount(bot, plan.variant.identity);
    if (inventoryBefore - inventoryAfter < plan.requested) throw new Error(`Inventory verification found only ${Math.max(0, inventoryBefore - inventoryAfter)} of ${plan.requested} deposited ${state.displayName}.`);
    state.phase = 'returning';
    this.activities.update('storage-transfer', `Deposited ${state.transferred} items; returning to ${state.startPosition.x}, ${state.startPosition.y}, ${state.startPosition.z}`);
    await this.returnToStart(bot, startPosition, startYaw, startPitch, lookPosition);
    state.returned = true;
    state.phase = 'complete';
    this.logger.log(`[Storage] Deposited ${state.transferred} x ${state.displayName} and restored the starting position and view.`);
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
      containerCategories: new Map(),
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
    if (zone.mode === 'positions') {
      for (const listed of zone.positions) {
        if (!state.running) break;
        const block = bot.blockAt(listed);
        if (!block) {
          state.unknownBlocks += 1;
          continue;
        }
        if (!isStorageBlock(block)) {
          state.failures.push({ position: { ...listed }, message: 'The registered position is not a supported storage container.' });
          continue;
        }
        const position = pairedStoragePosition(block, (value) => bot.blockAt(value));
        const key = positionKey(position);
        if (!containers.has(key)) containers.set(key, position);
        const category = containerCategory(zone, listed);
        const currentCategory = state.containerCategories.get(key);
        if (category && currentCategory && currentCategory !== category.id) state.failures.push({ position: { ...listed }, message: 'Paired container positions have conflicting category assignments.' });
        else if (category) state.containerCategories.set(key, category.id);
      }
      return [...containers.values()];
    }
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
          const key = positionKey(position);
          if (!containers.has(key)) containers.set(key, position);
          const category = containerCategory(zone, block.position);
          const currentCategory = state.containerCategories.get(key);
          if (category && currentCategory && currentCategory !== category.id) state.failures.push({ position: normalizePosition(block.position), message: 'Paired container positions have conflicting category assignments.' });
          else if (category) state.containerCategories.set(key, category.id);
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
        await this.scanContainer(position, state, zone);
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

  async scanContainer(position, state, zone) {
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
      categoryId: state.containerCategories.get(positionKey(position)) || containerCategory(zone, position)?.id || null,
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
    return this.activities.stop('storage-transfer') || this.activities.stop('storage-audit') || this.activities.stop('storage-scan');
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
  MAX_STORAGE_AUDIT_CONTAINERS,
  MAX_STORAGE_AUDIT_ISSUES,
  StorageService,
  applyScanCategories,
  auditContainer,
  blockProperties,
  currentStorageContext,
  depositInventory,
  inventoryIdentityCount,
  itemRecord,
  pairedStoragePosition,
  positionKey,
  publicScan,
  windowInventoryItems
};
