'use strict';

const crypto = require('node:crypto');
const { itemIdentity } = require('./item-identity');

const MAX_STORAGE_AXIS = 128;
const MAX_STORAGE_VOLUME = 262144;

function finiteInteger(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be a finite number.`);
  return Math.floor(number);
}

function normalizePosition(value, label = 'Position') {
  if (!value || typeof value !== 'object') throw new Error(`${label} is required.`);
  return {
    x: finiteInteger(value.x, `${label} x`),
    y: finiteInteger(value.y, `${label} y`),
    z: finiteInteger(value.z, `${label} z`)
  };
}

function normalizeBounds(from, to) {
  const first = normalizePosition(from, 'Storage start');
  const second = normalizePosition(to, 'Storage end');
  const lower = {
    x: Math.min(first.x, second.x),
    y: Math.min(first.y, second.y),
    z: Math.min(first.z, second.z)
  };
  const upper = {
    x: Math.max(first.x, second.x),
    y: Math.max(first.y, second.y),
    z: Math.max(first.z, second.z)
  };
  const size = {
    x: upper.x - lower.x + 1,
    y: upper.y - lower.y + 1,
    z: upper.z - lower.z + 1
  };
  if (Math.max(size.x, size.y, size.z) > MAX_STORAGE_AXIS) throw new Error(`Storage zones cannot exceed ${MAX_STORAGE_AXIS} blocks on an axis.`);
  const volume = size.x * size.y * size.z;
  if (volume > MAX_STORAGE_VOLUME) throw new Error(`Storage zones cannot exceed ${MAX_STORAGE_VOLUME} blocks.`);
  return { from: lower, to: upper, size, volume };
}

function normalizeServer(value) {
  const source = value && typeof value === 'object' ? value : {};
  const host = String(source.host || '').trim().toLowerCase();
  const port = Number(source.port || 25565);
  if (!host || host.length > 253) throw new Error('A valid storage server host is required.');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('A valid storage server port is required.');
  return { host, port };
}

function normalizeDimension(value) {
  let dimension = String(value || '').trim().toLowerCase();
  if (!dimension || dimension.length > 128) throw new Error('A valid storage dimension is required.');
  const aliases = { overworld: 'minecraft:overworld', nether: 'minecraft:the_nether', the_nether: 'minecraft:the_nether', end: 'minecraft:the_end', the_end: 'minecraft:the_end' };
  dimension = aliases[dimension] || dimension;
  return dimension;
}

function storageZoneId(name, existing = []) {
  const base = String(name || '').trim().toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 48) || 'storage';
  const used = new Set(existing.map((zone) => zone.id));
  if (!used.has(base)) return base;
  for (let index = 2; index <= 9999; index += 1) {
    const candidate = `${base}-${index}`;
    if (!used.has(candidate)) return candidate;
  }
  return crypto.randomUUID();
}

function cleanStorageZone(input, options = {}) {
  if (!input || typeof input !== 'object') throw new Error('A storage zone is required.');
  const name = String(input.name || '').trim();
  if (!name || name.length > 64) throw new Error('Storage zone names must contain 1 to 64 characters.');
  const bounds = normalizeBounds(input.from, input.to);
  const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  const createdAt = Number.isFinite(Number(input.createdAt)) ? Number(input.createdAt) : now;
  const id = String(input.id || options.id || '').trim();
  if (!id || id.length > 80 || !/^[a-z0-9][a-z0-9-]*$/u.test(id)) throw new Error('A valid storage zone id is required.');
  return {
    id,
    name,
    server: normalizeServer(input.server),
    dimension: normalizeDimension(input.dimension),
    from: bounds.from,
    to: bounds.to,
    createdAt,
    updatedAt: now
  };
}

function cleanStorageZones(value) {
  if (!Array.isArray(value)) return [];
  const zones = [];
  const ids = new Set();
  const scopes = new Set();
  for (const input of value) {
    try {
      const zone = cleanStorageZone(input, { now: Number(input?.updatedAt) || Date.now() });
      const scope = `${zone.server.host}:${zone.server.port}:${zone.dimension}:${zone.name.toLowerCase()}`;
      if (ids.has(zone.id) || scopes.has(scope)) continue;
      ids.add(zone.id);
      scopes.add(scope);
      zones.push(zone);
    } catch {}
  }
  return zones.sort((left, right) => left.name.localeCompare(right.name));
}

function createStorageZone(input, existing = [], now = Date.now()) {
  const id = String(input?.id || '').trim() || storageZoneId(input?.name, existing);
  return cleanStorageZone(input, { id, now });
}

function storageContext(value) {
  return {
    server: normalizeServer(value?.server || value),
    dimension: normalizeDimension(value?.dimension)
  };
}

function zoneMatchesContext(zone, context) {
  if (!zone || !context) return false;
  try {
    const current = storageContext(context);
    return zone.server.host === current.server.host && zone.server.port === current.server.port && zone.dimension === current.dimension;
  } catch {
    return false;
  }
}

function storageVariant(item) {
  const identity = itemIdentity(item);
  return {
    id: crypto.createHash('sha256').update(identity).digest('hex').slice(0, 24),
    identity
  };
}

module.exports = {
  MAX_STORAGE_AXIS,
  MAX_STORAGE_VOLUME,
  cleanStorageZone,
  cleanStorageZones,
  createStorageZone,
  normalizeBounds,
  normalizeDimension,
  normalizePosition,
  normalizeServer,
  storageContext,
  storageVariant,
  storageZoneId,
  zoneMatchesContext
};
