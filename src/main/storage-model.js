'use strict';

const crypto = require('node:crypto');
const { itemIdentity } = require('./item-identity');

const MAX_STORAGE_AXIS = 128;
const MAX_STORAGE_VOLUME = 262144;
const MAX_STORAGE_CATEGORIES = 64;
const MAX_CATEGORY_SELECTORS = 256;
const MAX_CATEGORY_CONTAINERS = 512;
const MAX_STORAGE_POSITIONS = 512;
const MAX_STORAGE_POSITION_SPAN = 4096;

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

function positionInBounds(position, bounds) {
  return position.x >= bounds.from.x && position.x <= bounds.to.x && position.y >= bounds.from.y && position.y <= bounds.to.y && position.z >= bounds.from.z && position.z <= bounds.to.z;
}

function normalizePositionList(value) {
  if (!Array.isArray(value) || !value.length || value.length > MAX_STORAGE_POSITIONS) throw new Error(`Position-list storage zones require 1 to ${MAX_STORAGE_POSITIONS} container positions.`);
  const positions = [];
  const keys = new Set();
  for (const entry of value) {
    const position = normalizePosition(entry, 'Storage container');
    const key = `${position.x},${position.y},${position.z}`;
    if (keys.has(key)) continue;
    keys.add(key);
    positions.push(position);
  }
  const coordinates = (axis) => positions.map((position) => position[axis]);
  const from = { x: Math.min(...coordinates('x')), y: Math.min(...coordinates('y')), z: Math.min(...coordinates('z')) };
  const to = { x: Math.max(...coordinates('x')), y: Math.max(...coordinates('y')), z: Math.max(...coordinates('z')) };
  if (Math.max(to.x - from.x, to.y - from.y, to.z - from.z) > MAX_STORAGE_POSITION_SPAN) throw new Error(`Position-list storage zones cannot span more than ${MAX_STORAGE_POSITION_SPAN} blocks.`);
  return { positions: positions.sort((left, right) => left.x - right.x || left.y - right.y || left.z - right.z), from, to };
}

function categoryId(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 48);
}

function cleanStorageCategories(value, bounds, positions = null) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_STORAGE_CATEGORIES) throw new Error(`Storage zones cannot contain more than ${MAX_STORAGE_CATEGORIES} categories.`);
  const categories = [];
  const ids = new Set();
  const names = new Set();
  const assigned = new Set();
  const selectors = new Set();
  let overflow = false;
  for (const input of value) {
    const name = String(input?.name || '').trim();
    const id = categoryId(input?.id || name);
    if (!name || name.length > 64 || !id) throw new Error('Storage category names must contain 1 to 64 characters.');
    if (ids.has(id) || names.has(name.toLowerCase())) throw new Error(`Storage category ${name} is duplicated.`);
    const items = [...new Set((Array.isArray(input?.items) ? input.items : []).map((entry) => String(entry || '').trim().toLowerCase()).filter(Boolean))];
    if (items.length > MAX_CATEGORY_SELECTORS || items.some((entry) => entry.length > 128 || [...entry].some((character) => character.codePointAt(0) < 32 || character.codePointAt(0) === 127))) throw new Error(`Storage categories can contain up to ${MAX_CATEGORY_SELECTORS} valid item selectors.`);
    for (const selector of items) {
      if (selectors.has(selector)) throw new Error(`Storage item selector ${selector} belongs to more than one category.`);
      selectors.add(selector);
    }
    const containers = (Array.isArray(input?.containers) ? input.containers : []).map((entry) => normalizePosition(entry, 'Category container'));
    if (containers.length > MAX_CATEGORY_CONTAINERS) throw new Error(`Storage categories cannot contain more than ${MAX_CATEGORY_CONTAINERS} containers.`);
    const uniqueContainers = [];
    const categoryContainers = new Set();
    for (const position of containers) {
      if (positions ? !positions.has(`${position.x},${position.y},${position.z}`) : !positionInBounds(position, bounds)) throw new Error(`A ${name} container is outside the storage zone.`);
      const key = `${position.x},${position.y},${position.z}`;
      if (categoryContainers.has(key)) continue;
      if (assigned.has(key)) throw new Error(`Storage container ${key} belongs to more than one category.`);
      categoryContainers.add(key);
      assigned.add(key);
      uniqueContainers.push(position);
    }
    const isOverflow = input?.overflow === true;
    if (isOverflow && overflow) throw new Error('A storage zone can have only one overflow category.');
    overflow ||= isOverflow;
    ids.add(id);
    names.add(name.toLowerCase());
    categories.push({ id, name, items: items.sort(), containers: uniqueContainers.sort((left, right) => left.x - right.x || left.y - right.y || left.z - right.z), overflow: isOverflow });
  }
  return categories.sort((left, right) => left.name.localeCompare(right.name));
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
  if (input.mode !== undefined && !['bounds', 'positions'].includes(input.mode)) throw new Error('Storage zone mode must be bounds or positions.');
  const name = String(input.name || '').trim();
  if (!name || name.length > 64) throw new Error('Storage zone names must contain 1 to 64 characters.');
  const usePositionList = input.mode === 'positions' || input.mode === undefined && Array.isArray(input.positions) && input.positions.length;
  const listed = usePositionList ? normalizePositionList(input.positions) : null;
  const bounds = listed ? { from: listed.from, to: listed.to } : normalizeBounds(input.from, input.to);
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
    mode: listed ? 'positions' : 'bounds',
    positions: listed?.positions || [],
    categories: cleanStorageCategories(input.categories, bounds, listed ? new Set(listed.positions.map((position) => `${position.x},${position.y},${position.z}`)) : null),
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
  MAX_CATEGORY_CONTAINERS,
  MAX_CATEGORY_SELECTORS,
  MAX_STORAGE_CATEGORIES,
  MAX_STORAGE_POSITIONS,
  MAX_STORAGE_POSITION_SPAN,
  MAX_STORAGE_AXIS,
  MAX_STORAGE_VOLUME,
  categoryId,
  cleanStorageCategories,
  cleanStorageZone,
  cleanStorageZones,
  createStorageZone,
  normalizeBounds,
  normalizeDimension,
  normalizePosition,
  normalizePositionList,
  normalizeServer,
  storageContext,
  storageVariant,
  storageZoneId,
  zoneMatchesContext
};
