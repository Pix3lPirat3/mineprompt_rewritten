'use strict';

const DEFAULT_BEAM_WIDTH = 128;
const MAX_WITHDRAWAL_CONTAINERS = 256;
const WITHDRAWAL_BRANCH_WIDTH = 48;
const WITHDRAWAL_NEARBY_BRANCH_WIDTH = 32;

function positionKey(position) {
  return `${Math.floor(position.x)},${Math.floor(position.y)},${Math.floor(position.z)}`;
}

function distance(left, right) {
  const dx = left.x - right.x;
  const dy = left.y - right.y;
  const dz = left.z - right.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function withdrawalKey(zoneId, position, variantId) {
  return `withdraw:${zoneId}:${positionKey(position)}:${variantId}`;
}

function depositStackKey(zoneId, position, slot, variantId) {
  return `deposit:${zoneId}:stack:${positionKey(position)}:${slot}:${variantId}`;
}

function depositEmptyKey(zoneId, position, slot) {
  return `deposit:${zoneId}:empty:${positionKey(position)}:${slot}`;
}

function reservationMap(snapshot) {
  return new Map((snapshot?.reservations || []).map((entry) => [String(entry.key), Math.max(0, Number(entry.count) || 0)]));
}

function indexedVariants(scan) {
  return [...scan.items.values()];
}

function resolveIndexedVariant(scan, selector) {
  const query = String(selector || '').trim().toLowerCase();
  if (!query) throw new Error('An exact item name or variant id is required.');
  const variants = indexedVariants(scan);
  const byId = variants.find((item) => item.variantId.toLowerCase() === query);
  if (byId) return byId;
  const matches = variants.filter((item) => item.name.toLowerCase() === query || item.displayName.toLowerCase() === query);
  if (!matches.length) throw new Error(`No indexed item exactly matches ${selector}.`);
  if (matches.length > 1) throw new Error(`${selector} matches multiple item variants. Use the variant id shown by storage inspect.`);
  return matches[0];
}

function resolveInventoryVariant(inventory, selector, slot) {
  const variants = [...inventory.values()];
  if (slot !== undefined && slot !== null) {
    const target = Number(slot);
    if (!Number.isInteger(target)) throw new Error('An inventory slot must be an integer.');
    const match = variants.find((item) => item.slots.some((entry) => entry.slot === target));
    if (!match) throw new Error(`Inventory slot ${target} does not contain a depositable item.`);
    return match;
  }
  const query = String(selector || '').trim().toLowerCase();
  if (!query) throw new Error('An exact inventory item name, variant id, or slot is required.');
  const byId = variants.find((item) => item.variantId.toLowerCase() === query);
  if (byId) return byId;
  const matches = variants.filter((item) => item.name.toLowerCase() === query || item.displayName.toLowerCase() === query);
  if (!matches.length) throw new Error(`No inventory item exactly matches ${selector}.`);
  if (matches.length > 1) throw new Error(`${selector} matches multiple inventory variants. Use an inventory slot or variant id.`);
  return matches[0];
}

function containerCategory(zone, position) {
  const key = positionKey(position);
  return (zone.categories || []).find((category) => category.containers.some((entry) => positionKey(entry) === key)) || null;
}

function resolveDepositCategory(zone, variant, selector) {
  const categories = zone.categories || [];
  const requested = String(selector || '').trim().toLowerCase();
  if (requested) {
    const category = categories.find((entry) => entry.id.toLowerCase() === requested || entry.name.toLowerCase() === requested);
    if (!category) throw new Error(`Storage category ${selector} was not found in ${zone.name}.`);
    return category;
  }
  const keys = new Set([variant.variantId, variant.name, variant.displayName].map((entry) => String(entry || '').toLowerCase()));
  return categories.find((category) => category.items.some((entry) => keys.has(entry))) || null;
}

function depositCandidates(zone, scan, variant, category, reservations = new Map()) {
  const candidates = [];
  for (const container of scan.containers) {
    const assigned = containerCategory(zone, container.position);
    const exact = container.items.find((item) => item.identity === variant.identity);
    const occupied = new Set(container.items.flatMap((item) => item.slots.map((entry) => entry.slot)));
    for (const source of exact?.slots || []) {
      const indexedAvailable = Math.max(0, variant.stackSize - source.count);
      const key = depositStackKey(zone.id, container.position, source.slot, variant.variantId);
      const available = Math.max(0, indexedAvailable - (reservations.get(key) || 0));
      if (!available) continue;
      candidates.push({
        key,
        position: { ...container.position },
        slot: source.slot,
        kind: 'partial',
        tier: !category || assigned?.id === category.id ? 0 : 1,
        available,
        indexedAvailable
      });
    }
    for (let slot = 0; slot < container.slotCount; slot += 1) {
      if (occupied.has(slot)) continue;
      const key = depositEmptyKey(zone.id, container.position, slot);
      if ((reservations.get(key) || 0) > 0) continue;
      let tier = Number.POSITIVE_INFINITY;
      if (exact) tier = 1;
      else if (category && assigned?.id === category.id) tier = 2;
      else if (!assigned || assigned.overflow) tier = 3;
      if (!Number.isFinite(tier)) continue;
      candidates.push({
        key,
        position: { ...container.position },
        slot,
        kind: 'empty',
        tier,
        available: variant.stackSize,
        indexedAvailable: 1
      });
    }
  }
  return candidates.sort((left, right) => left.tier - right.tier || positionKey(left.position).localeCompare(positionKey(right.position)) || left.slot - right.slot);
}

function capacityGroups(candidates, tier) {
  const groups = new Map();
  for (const candidate of candidates) {
    if (candidate.tier !== tier) continue;
    const key = positionKey(candidate.position);
    const group = groups.get(key) || { position: candidate.position, slots: [], capacity: 0 };
    group.slots.push(candidate);
    group.capacity += candidate.available;
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    slots: group.slots.sort((left, right) => (left.kind === 'partial' ? 0 : 1) - (right.kind === 'partial' ? 0 : 1) || left.slot - right.slot)
  }));
}

function chooseCapacityGroups(groups, count, origin, beamWidth = DEFAULT_BEAM_WIDTH, openPenalty = 6) {
  if (!count) return [];
  let frontier = [{ remaining: count, position: origin, used: [], allocations: [], cost: 0 }];
  const complete = [];
  while (frontier.length) {
    const next = [];
    for (const state of frontier) {
      const unused = groups.map((group, index) => ({ group, index })).filter(({ index }) => !state.used.includes(index));
      const nearest = [...unused].sort((left, right) => distance(state.position, left.group.position) - distance(state.position, right.group.position) || right.group.capacity - left.group.capacity || left.index - right.index).slice(0, WITHDRAWAL_NEARBY_BRANCH_WIDTH);
      const largest = [...unused].sort((left, right) => right.group.capacity - left.group.capacity || distance(state.position, left.group.position) - distance(state.position, right.group.position) || left.index - right.index).slice(0, WITHDRAWAL_BRANCH_WIDTH - WITHDRAWAL_NEARBY_BRANCH_WIDTH);
      const optionIndexes = new Set([...nearest, ...largest].map(({ index }) => index));
      for (const { group, index } of unused.filter((entry) => optionIndexes.has(entry.index))) {
        const taken = Math.min(state.remaining, group.capacity);
        const successor = {
          remaining: state.remaining - taken,
          position: group.position,
          used: [...state.used, index].sort((left, right) => left - right),
          allocations: [...state.allocations, { group, count: taken }],
          cost: state.cost + distance(state.position, group.position) + openPenalty
        };
        if (!successor.remaining) complete.push(successor);
        else next.push(successor);
      }
    }
    const unique = new Map();
    for (const state of next.sort((left, right) => left.cost - right.cost || left.remaining - right.remaining)) {
      const key = stateKey(state);
      if (!unique.has(key)) unique.set(key, state);
    }
    frontier = [...unique.values()].slice(0, Math.max(1, Math.min(1024, Number(beamWidth) || DEFAULT_BEAM_WIDTH)));
    const bestComplete = complete.reduce((best, state) => Math.min(best, state.cost), Number.POSITIVE_INFINITY);
    if (frontier.length && frontier[0].cost + openPenalty >= bestComplete) break;
  }
  const selected = complete.sort((left, right) => left.cost - right.cost || left.allocations.length - right.allocations.length)[0];
  if (!selected) throw new Error('No bounded storage capacity allocation could satisfy the request.');
  return selected.allocations;
}

function planDeposit({ zone, scan, inventory, selector, slot, count, category: categorySelector, origin, reservations, beamWidth = DEFAULT_BEAM_WIDTH, openPenalty = 6 }) {
  if (!scan?.complete || scan.stale) throw new Error('A complete current storage scan is required before depositing items.');
  const start = { x: Number(origin?.x), y: Number(origin?.y), z: Number(origin?.z) };
  if (![start.x, start.y, start.z].every(Number.isFinite)) throw new Error('A finite starting position is required for storage allocation.');
  const variant = resolveInventoryVariant(inventory, selector, slot);
  const requested = count === undefined || count === null ? variant.count : Number(count);
  if (!Number.isInteger(requested) || requested < 1 || requested > variant.count) throw new Error(`Deposit count must be from 1 to ${variant.count}.`);
  const category = resolveDepositCategory(zone, variant, categorySelector);
  const reserved = reservations instanceof Map ? reservations : reservationMap(reservations);
  const candidates = depositCandidates(zone, scan, variant, category, reserved);
  const available = candidates.reduce((sum, candidate) => sum + candidate.available, 0);
  if (available < requested) throw new Error(`${zone.name} has space for ${available} matching items, but ${requested} were requested.`);
  const allocations = [];
  let remaining = requested;
  let current = start;
  for (let tier = 0; tier <= 3 && remaining; tier += 1) {
    const groups = capacityGroups(candidates, tier);
    const tierCapacity = groups.reduce((sum, group) => sum + group.capacity, 0);
    const target = Math.min(remaining, tierCapacity);
    if (!target) continue;
    const selected = chooseCapacityGroups(groups, target, current, beamWidth, openPenalty);
    for (const entry of selected) {
      let allocationRemaining = entry.count;
      const slots = [];
      for (const destination of entry.group.slots) {
        if (!allocationRemaining) break;
        const taken = Math.min(allocationRemaining, destination.available);
        slots.push({ ...destination, count: taken });
        allocationRemaining -= taken;
      }
      allocations.push({ position: { ...entry.group.position }, count: entry.count, tier, slots });
      current = entry.group.position;
      remaining -= entry.count;
    }
  }
  if (remaining) throw new Error(`No bounded storage deposit allocation could place ${remaining} items.`);
  const merged = new Map();
  for (const allocation of allocations) {
    const key = positionKey(allocation.position);
    const currentAllocation = merged.get(key);
    if (currentAllocation) {
      currentAllocation.count += allocation.count;
      currentAllocation.tier = Math.min(currentAllocation.tier, allocation.tier);
      currentAllocation.slots.push(...allocation.slots);
    } else merged.set(key, { ...allocation, slots: [...allocation.slots] });
  }
  if (merged.size > MAX_WITHDRAWAL_CONTAINERS) throw new Error(`The deposit would require more than ${MAX_WITHDRAWAL_CONTAINERS} container visits.`);
  const improved = improveRoute(start, [...merged.values()].map((entry) => ({ ...entry, available: entry.count, stackSize: variant.stackSize })), openPenalty);
  const planned = improved.allocations.map(({ available: ignoredAvailable, stackSize: ignoredStackSize, ...entry }) => entry);
  return {
    zoneId: zone.id,
    category: category ? { id: category.id, name: category.name } : null,
    variant: { variantId: variant.variantId, name: variant.name, displayName: variant.displayName, identity: variant.identity, stackSize: variant.stackSize },
    requested,
    available,
    allocations: planned,
    estimatedCost: improved.cost,
    reservationEntries: planned.flatMap((entry) => entry.slots.map((destination) => ({
      key: destination.key,
      count: destination.kind === 'empty' ? 1 : destination.count,
      available: destination.indexedAvailable
    })))
  };
}

function withdrawalCandidates(zoneId, scan, variant, reservations = new Map()) {
  const candidates = [];
  for (const container of scan.containers) {
    const item = container.items.find((entry) => entry.identity === variant.identity);
    if (!item) continue;
    const key = withdrawalKey(zoneId, container.position, variant.variantId);
    const available = Math.max(0, item.count - (reservations.get(key) || 0));
    if (!available) continue;
    candidates.push({
      key,
      position: { ...container.position },
      available,
      indexedAvailable: item.count,
      stackSize: item.stackSize,
      variantId: item.variantId,
      identity: item.identity,
      name: item.name,
      displayName: item.displayName
    });
  }
  return candidates.sort((left, right) => positionKey(left.position).localeCompare(positionKey(right.position)));
}

function routeCost(origin, allocations, openPenalty) {
  let current = origin;
  let cost = 0;
  for (const allocation of allocations) {
    cost += distance(current, allocation.position) + openPenalty;
    if (allocation.count < allocation.available && allocation.available - allocation.count < allocation.stackSize) cost += 0.25;
    current = allocation.position;
  }
  return cost;
}

function improveRoute(origin, allocations, openPenalty) {
  let route = [...allocations];
  let best = routeCost(origin, route, openPenalty);
  let improved = true;
  while (improved) {
    improved = false;
    for (let first = 0; first < route.length - 1; first += 1) {
      for (let last = first + 1; last < route.length; last += 1) {
        const candidate = [...route.slice(0, first), ...route.slice(first, last + 1).reverse(), ...route.slice(last + 1)];
        const cost = routeCost(origin, candidate, openPenalty);
        if (cost + 1e-9 >= best) continue;
        route = candidate;
        best = cost;
        improved = true;
      }
    }
  }
  return { allocations: route, cost: best };
}

function stateKey(state) {
  return `${state.remaining}:${state.used.join(',')}:${positionKey(state.position)}`;
}

function planWithdrawal({ zoneId, scan, selector, count, origin, reservations, beamWidth = DEFAULT_BEAM_WIDTH, openPenalty = 6 }) {
  if (!scan?.complete || scan.stale) throw new Error('A complete current storage scan is required before fetching items.');
  const requested = Number(count);
  if (!Number.isInteger(requested) || requested < 1 || requested > 2147483647) throw new Error('Fetch count must be a positive integer.');
  const start = { x: Number(origin?.x), y: Number(origin?.y), z: Number(origin?.z) };
  if (![start.x, start.y, start.z].every(Number.isFinite)) throw new Error('A finite starting position is required for storage allocation.');
  const variant = resolveIndexedVariant(scan, selector);
  const reserved = reservations instanceof Map ? reservations : reservationMap(reservations);
  const candidates = withdrawalCandidates(zoneId, scan, variant, reserved);
  const available = candidates.reduce((sum, candidate) => sum + candidate.available, 0);
  if (available < requested) throw new Error(`Storage has ${available} available ${variant.displayName}, but ${requested} were requested.`);
  let capacity = 0;
  let minimumContainers = 0;
  for (const candidate of [...candidates].sort((left, right) => right.available - left.available)) {
    capacity += candidate.available;
    minimumContainers += 1;
    if (capacity >= requested) break;
  }
  if (minimumContainers > MAX_WITHDRAWAL_CONTAINERS) throw new Error(`The fetch would require more than ${MAX_WITHDRAWAL_CONTAINERS} container visits.`);
  let frontier = [{ remaining: requested, position: start, used: [], allocations: [], cost: 0 }];
  const complete = [];
  while (frontier.length) {
    const next = [];
    for (const state of frontier) {
      const unused = candidates.map((candidate, index) => ({ candidate, index })).filter(({ index }) => !state.used.includes(index));
      const nearest = [...unused].sort((left, right) => distance(state.position, left.candidate.position) - distance(state.position, right.candidate.position) || right.candidate.available - left.candidate.available || left.index - right.index).slice(0, WITHDRAWAL_NEARBY_BRANCH_WIDTH);
      const largest = [...unused].sort((left, right) => right.candidate.available - left.candidate.available || distance(state.position, left.candidate.position) - distance(state.position, right.candidate.position) || left.index - right.index).slice(0, WITHDRAWAL_BRANCH_WIDTH - WITHDRAWAL_NEARBY_BRANCH_WIDTH);
      const optionIndexes = new Set([...nearest, ...largest].map(({ index }) => index));
      const options = unused.filter(({ index }) => optionIndexes.has(index)).sort((left, right) => {
        const leftScore = distance(state.position, left.candidate.position) - Math.min(state.remaining, left.candidate.available) / Math.max(1, state.remaining);
        const rightScore = distance(state.position, right.candidate.position) - Math.min(state.remaining, right.candidate.available) / Math.max(1, state.remaining);
        return leftScore - rightScore || right.candidate.available - left.candidate.available || left.index - right.index;
      });
      for (const { candidate, index } of options) {
        const taken = Math.min(state.remaining, candidate.available);
        const allocation = { ...candidate, count: taken };
        const cost = state.cost + distance(state.position, candidate.position) + openPenalty + (taken < candidate.available && candidate.available - taken < candidate.stackSize ? 0.25 : 0);
        const successor = {
          remaining: state.remaining - taken,
          position: candidate.position,
          used: [...state.used, index].sort((left, right) => left - right),
          allocations: [...state.allocations, allocation],
          cost
        };
        if (!successor.remaining) complete.push(successor);
        else next.push(successor);
      }
    }
    const unique = new Map();
    for (const state of next.sort((left, right) => left.cost - right.cost || left.remaining - right.remaining)) {
      const key = stateKey(state);
      if (!unique.has(key)) unique.set(key, state);
    }
    frontier = [...unique.values()].slice(0, Math.max(1, Math.min(1024, Number(beamWidth) || DEFAULT_BEAM_WIDTH)));
    const bestComplete = complete.reduce((best, state) => Math.min(best, state.cost), Number.POSITIVE_INFINITY);
    if (frontier.length && frontier[0].cost + openPenalty >= bestComplete) break;
  }
  const selected = complete.sort((left, right) => left.cost - right.cost || left.allocations.length - right.allocations.length)[0];
  if (!selected) throw new Error('No bounded storage allocation could satisfy the request.');
  const improved = improveRoute(start, selected.allocations, openPenalty);
  return {
    zoneId,
    variant: { variantId: variant.variantId, name: variant.name, displayName: variant.displayName, identity: variant.identity },
    requested,
    available,
    allocations: improved.allocations,
    estimatedCost: improved.cost,
    reservationEntries: improved.allocations.map((entry) => ({ key: entry.key, count: entry.count, available: entry.indexedAvailable }))
  };
}

module.exports = { DEFAULT_BEAM_WIDTH, MAX_WITHDRAWAL_CONTAINERS, WITHDRAWAL_BRANCH_WIDTH, WITHDRAWAL_NEARBY_BRANCH_WIDTH, capacityGroups, chooseCapacityGroups, containerCategory, depositCandidates, depositEmptyKey, depositStackKey, distance, improveRoute, planDeposit, planWithdrawal, positionKey, reservationMap, resolveDepositCategory, resolveIndexedVariant, resolveInventoryVariant, routeCost, withdrawalCandidates, withdrawalKey };
