'use strict';

const { installRuntime } = require('./kernel');
const { registerCapability, serviceClient } = require('./shared');
const { StorageService } = require('../../../src/main/storage-service');
const { cleanStorageZones, createStorageZone } = require('../../../src/main/storage-model');

class MemoryStorageStore {
  constructor(zones = []) {
    this.data = { storageZones: cleanStorageZones(zones) };
  }

  snapshot() {
    return structuredClone(this.data);
  }

  async saveStorageZone(input) {
    const id = String(input?.id || '').trim();
    const existing = id ? this.data.storageZones.find((zone) => zone.id === id) : null;
    const zone = createStorageZone({ ...existing, ...input }, this.data.storageZones);
    const index = this.data.storageZones.findIndex((entry) => entry.id === zone.id);
    if (index >= 0) this.data.storageZones[index] = zone;
    else this.data.storageZones.push(zone);
    this.data.storageZones.sort((left, right) => left.name.localeCompare(right.name));
    return structuredClone(zone);
  }

  async removeStorageZone(id) {
    const target = String(id || '').toLowerCase();
    const previous = this.data.storageZones.length;
    this.data.storageZones = this.data.storageZones.filter((zone) => zone.id.toLowerCase() !== target);
    return this.data.storageZones.length !== previous;
  }
}

function installStorage(bot, options = {}) {
  const runtime = installRuntime(bot, options.runtime);
  if (runtime.has('storage')) return runtime.get('storage');
  const client = options.client || serviceClient(bot, { storageContext: options.context });
  const store = options.store || new MemoryStorageStore(options.zones);
  let api;
  const notify = () => runtime.emit('storage:change', api?.snapshot());
  const service = options.service || new StorageService({
    getClient: () => client,
    store,
    activities: runtime.activities,
    logger: options.logger || runtime.logger,
    onChange: notify
  });
  api = Object.freeze({
    service,
    store,
    zones: (request = {}) => service.zones(request),
    saveZone: (request) => service.saveZone(request),
    removeZone: (reference) => service.removeZone(reference),
    scan: (reference) => service.start(reference),
    inspect: (reference) => service.inspect(reference),
    find: (selector, request = {}) => service.find(selector, request),
    status: () => service.status(),
    stop: () => service.stop(),
    snapshot: () => service.summary()
  });
  return registerCapability(runtime, 'storage', api, 'Server-scoped storage zones, exact item indexes, and read-only container scanning.', [
    {
      id: 'storage.zones',
      title: 'List storage zones',
      capability: 'storage',
      risk: 'read',
      inputSchema: { type: 'object', properties: { all: { type: 'boolean' } }, additionalProperties: false },
      execute: ({ request }) => api.zones(request)
    },
    {
      id: 'storage.save',
      title: 'Save a storage zone',
      capability: 'storage',
      risk: 'dangerous',
      inputSchema: { type: 'object', additionalProperties: true },
      execute: ({ request }) => api.saveZone(request)
    },
    {
      id: 'storage.remove',
      title: 'Remove a storage zone',
      capability: 'storage',
      risk: 'dangerous',
      inputSchema: { type: 'object', properties: { zone: { type: 'string' } }, required: ['zone'], additionalProperties: false },
      execute: ({ request }) => api.removeZone(request.zone)
    },
    {
      id: 'storage.scan',
      title: 'Scan a storage zone',
      capability: 'storage',
      risk: 'dangerous',
      inputSchema: { type: 'object', properties: { zone: { type: 'string' } }, required: ['zone'], additionalProperties: false },
      execute: ({ request }) => api.scan(request.zone)
    },
    {
      id: 'storage.inspect',
      title: 'Inspect a storage index',
      capability: 'storage',
      risk: 'read',
      inputSchema: { type: 'object', properties: { zone: { type: 'string' } }, required: ['zone'], additionalProperties: false },
      execute: ({ request }) => api.inspect(request.zone)
    },
    {
      id: 'storage.find',
      title: 'Find indexed items',
      capability: 'storage',
      risk: 'read',
      inputSchema: {
        type: 'object',
        properties: { item: { type: 'string' }, zone: { type: 'string' }, minimum: { type: 'integer', minimum: 0 } },
        required: ['item'],
        additionalProperties: false
      },
      execute: ({ request }) => api.find(request.item, request)
    },
    {
      id: 'storage.stop',
      title: 'Stop a storage scan',
      capability: 'storage',
      risk: 'dangerous',
      inputSchema: { type: 'object', additionalProperties: false },
      execute: () => api.stop()
    }
  ]);
}

function storagePlugin(options = {}) {
  return (bot) => installStorage(bot, options);
}

module.exports = { MemoryStorageStore, installStorage, storagePlugin };
