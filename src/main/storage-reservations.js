'use strict';

const crypto = require('node:crypto');

const MAX_RESERVATION_ENTRIES = 512;
const MAX_RESERVATION_TTL = 300000;

function normalizeOwner(value) {
  const owner = String(value || '').trim();
  if (!owner || owner.length > 128) throw new Error('A valid storage reservation owner is required.');
  return owner;
}

function normalizeTtl(value, fallback = 30000) {
  const ttl = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(ttl) || ttl < 1000 || ttl > MAX_RESERVATION_TTL) throw new Error(`Storage reservation TTL must be from 1000 to ${MAX_RESERVATION_TTL} milliseconds.`);
  return ttl;
}

function normalizeEntries(value) {
  if (!Array.isArray(value) || !value.length || value.length > MAX_RESERVATION_ENTRIES) throw new Error(`Storage reservations require 1 to ${MAX_RESERVATION_ENTRIES} entries.`);
  const grouped = new Map();
  for (const input of value) {
    const key = String(input?.key || '').trim();
    const count = Number(input?.count);
    const available = Number(input?.available);
    if (!key || key.length > 320) throw new Error('Storage reservation keys must contain 1 to 320 characters.');
    if (!Number.isInteger(count) || count < 1 || count > 2147483647) throw new Error('Storage reservation counts must be positive integers.');
    if (!Number.isInteger(available) || available < 0 || available > 2147483647) throw new Error('Storage reservation availability must be a non-negative integer.');
    const current = grouped.get(key);
    if (current) {
      current.count += count;
      current.available = Math.min(current.available, available);
      if (current.count > 2147483647) throw new Error('A storage reservation count is too large.');
    } else {
      grouped.set(key, { key, count, available });
    }
  }
  return [...grouped.values()].sort((left, right) => left.key.localeCompare(right.key));
}

class StorageReservationBroker {
  constructor({ now = () => Date.now(), defaultTtl = 30000 } = {}) {
    this.now = now;
    this.defaultTtl = normalizeTtl(defaultTtl);
    this.leases = new Map();
    this.revision = 0;
  }

  purge() {
    const now = this.now();
    let changed = false;
    for (const [id, lease] of this.leases) {
      if (lease.expiresAt > now) continue;
      this.leases.delete(id);
      changed = true;
    }
    if (changed) this.revision += 1;
    return changed;
  }

  totals(excludedLeaseId = null) {
    this.purge();
    const totals = new Map();
    for (const lease of this.leases.values()) {
      if (lease.id === excludedLeaseId) continue;
      for (const entry of lease.entries) totals.set(entry.key, (totals.get(entry.key) || 0) + entry.count);
    }
    return totals;
  }

  reserve(request = {}) {
    const owner = normalizeOwner(request.owner);
    const entries = normalizeEntries(request.entries);
    const ttl = normalizeTtl(request.ttlMs, this.defaultTtl);
    const totals = this.totals();
    for (const entry of entries) {
      const remaining = entry.available - (totals.get(entry.key) || 0);
      if (entry.count > remaining) throw new Error(`Storage reservation ${entry.key} has only ${Math.max(0, remaining)} available.`);
    }
    const createdAt = this.now();
    const lease = {
      id: crypto.randomUUID(),
      owner,
      createdAt,
      expiresAt: createdAt + ttl,
      entries: entries.map(({ key, count }) => ({ key, count }))
    };
    this.leases.set(lease.id, lease);
    this.revision += 1;
    return structuredClone(lease);
  }

  renew(id, owner, ttlMs) {
    this.purge();
    const lease = this.leases.get(String(id || ''));
    if (!lease || lease.owner !== normalizeOwner(owner)) throw new Error('The storage reservation no longer exists.');
    lease.expiresAt = this.now() + normalizeTtl(ttlMs, this.defaultTtl);
    this.revision += 1;
    return structuredClone(lease);
  }

  release(id, owner) {
    this.purge();
    const lease = this.leases.get(String(id || ''));
    if (!lease || owner !== undefined && lease.owner !== normalizeOwner(owner)) return false;
    this.leases.delete(lease.id);
    this.revision += 1;
    return true;
  }

  releaseOwner(owner) {
    const target = normalizeOwner(owner);
    this.purge();
    let removed = 0;
    for (const [id, lease] of this.leases) {
      if (lease.owner !== target) continue;
      this.leases.delete(id);
      removed += 1;
    }
    if (removed) this.revision += 1;
    return removed;
  }

  snapshot(request = {}) {
    const totals = this.totals();
    const keys = Array.isArray(request.keys) ? new Set(request.keys.map(String)) : null;
    const prefix = request.prefix ? String(request.prefix) : '';
    const reservations = [...totals.entries()]
      .filter(([key]) => (!keys || keys.has(key)) && (!prefix || key.startsWith(prefix)))
      .map(([key, count]) => ({ key, count }))
      .sort((left, right) => left.key.localeCompare(right.key));
    return { revision: this.revision, reservations };
  }
}

module.exports = { MAX_RESERVATION_ENTRIES, MAX_RESERVATION_TTL, StorageReservationBroker, normalizeEntries, normalizeOwner, normalizeTtl };
