'use strict';

function primitiveIdentity(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'number' && Number.isNaN(value)) return 'number:NaN';
  if (typeof value === 'number' && !Number.isFinite(value)) return `number:${value}`;
  if (typeof value === 'bigint') return `bigint:${value}`;
  if (typeof value === 'symbol') return `symbol:${String(value.description || '')}`;
  if (typeof value === 'function') return `function:${value.name || ''}`;
  return `${typeof value}:${JSON.stringify(value)}`;
}

function valueIdentity(value, ancestors = new Set(), depth = 0) {
  if (value === null || typeof value !== 'object') return primitiveIdentity(value);
  if (depth >= 64) return 'depth-limit';
  if (ancestors.has(value)) return 'circular';
  if (Buffer.isBuffer(value)) return `buffer:${value.toString('base64')}`;
  if (ArrayBuffer.isView(value)) return `${value.constructor.name}:[${Array.from(value).join(',')}]`;
  if (value instanceof Date) return `date:${value.toISOString()}`;
  ancestors.add(value);
  try {
    if (Array.isArray(value)) return `array:[${value.map((entry) => valueIdentity(entry, ancestors, depth + 1)).join(',')}]`;
    if (value instanceof Map) {
      const entries = [...value.entries()].map(([key, entry]) => [valueIdentity(key, ancestors, depth + 1), valueIdentity(entry, ancestors, depth + 1)]);
      entries.sort(([left], [right]) => left.localeCompare(right));
      return `map:{${entries.map(([key, entry]) => `${key}:${entry}`).join(',')}}`;
    }
    if (value instanceof Set) {
      const entries = [...value].map((entry) => valueIdentity(entry, ancestors, depth + 1)).sort();
      return `set:[${entries.join(',')}]`;
    }
    const entries = Object.keys(value).sort().map((key) => {
      let entry;
      try { entry = value[key]; } catch { entry = 'unavailable'; }
      return `${JSON.stringify(key)}:${valueIdentity(entry, ancestors, depth + 1)}`;
    });
    return `object:{${entries.join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}

function componentIdentity(value) {
  if (!Array.isArray(value)) return valueIdentity(value ?? null);
  return `components:[${value.map((entry) => valueIdentity(entry)).sort().join(',')}]`;
}

function itemIdentity(item, cache = null) {
  if (!item || typeof item !== 'object') return '';
  if (cache?.has(item)) return cache.get(item);
  const identity = [
    primitiveIdentity(item.type),
    primitiveIdentity(item.metadata ?? 0),
    valueIdentity(item.nbt ?? null),
    componentIdentity(item.components),
    componentIdentity(item.removedComponents)
  ].join('|');
  cache?.set(item, identity);
  return identity;
}

function itemsMatch(left, right, cache = null) {
  if (left === right) return Boolean(left);
  if (!left || !right || left.type !== right.type || (left.metadata ?? 0) !== (right.metadata ?? 0)) return false;
  return itemIdentity(left, cache) === itemIdentity(right, cache);
}

module.exports = { componentIdentity, itemIdentity, itemsMatch, valueIdentity };
