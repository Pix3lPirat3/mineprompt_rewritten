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

module.exports = { DEFAULT_BEAM_WIDTH, MAX_WITHDRAWAL_CONTAINERS, WITHDRAWAL_BRANCH_WIDTH, WITHDRAWAL_NEARBY_BRANCH_WIDTH, distance, improveRoute, planWithdrawal, positionKey, reservationMap, resolveIndexedVariant, routeCost, withdrawalCandidates, withdrawalKey };
