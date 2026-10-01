'use strict';

const { distance, key, point } = require('./mining-planner');

const TREE_SPECIES = Object.freeze(['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'mangrove', 'cherry', 'pale_oak']);
const TREE_LOGS = new Map(TREE_SPECIES.map((species) => [`${species}_log`, species]));
const TREE_LEAVES = new Map(TREE_SPECIES.map((species) => [`${species}_leaves`, species]));
TREE_LEAVES.set('azalea_leaves', 'oak');
TREE_LEAVES.set('flowering_azalea_leaves', 'oak');

const ADJACENT = Object.freeze(Array.from({ length: 27 }, (_, index) => {
  const x = index % 3 - 1;
  const y = Math.floor(index / 3) % 3 - 1;
  const z = Math.floor(index / 9) - 1;
  return [x, y, z];
}).filter(([x, y, z]) => x || y || z));

function blockName(block) {
  return String(block?.name || '').toLowerCase();
}

function treeSpecies(value) {
  return TREE_LOGS.get(typeof value === 'string' ? value.toLowerCase() : blockName(value)) || null;
}

function leafSpecies(value) {
  return TREE_LEAVES.get(typeof value === 'string' ? value.toLowerCase() : blockName(value)) || null;
}

function isTreeLog(value) {
  return treeSpecies(value) !== null;
}

function isTreeLeaf(value, species = null) {
  const found = leafSpecies(value);
  return found !== null && (!species || found === species);
}

function offset(position, x, y, z) {
  return { x: position.x + x, y: position.y + y, z: position.z + z };
}

function blockPosition(block, fallback) {
  return point(block?.position || fallback);
}

function nearestTreeLog(getBlock, origin, species, radius = 4) {
  const center = point(origin);
  const matches = [];
  for (let y = -radius; y <= radius; y += 1) {
    for (let x = -radius; x <= radius; x += 1) {
      for (let z = -radius; z <= radius; z += 1) {
        const position = offset(center, x, y, z);
        const block = getBlock(position);
        if (treeSpecies(block) === species) matches.push(blockPosition(block, position));
      }
    }
  }
  matches.sort((left, right) => distance(center, left) - distance(center, right) || key(left).localeCompare(key(right)));
  return matches[0] || null;
}

function treeSeed(getBlock, origin) {
  const position = point(origin);
  const block = getBlock(position);
  const log = treeSpecies(block);
  if (log) return { position: blockPosition(block, position), species: log };
  const leaves = leafSpecies(block);
  if (!leaves) throw new Error('The selected block is not part of a supported tree.');
  const nearest = nearestTreeLog(getBlock, position, leaves);
  if (!nearest) throw new Error('No matching tree trunk was found near the selected leaves.');
  return { position: nearest, species: leaves };
}

function collectLeaves(getBlock, logs, species, maximum) {
  const leaves = new Map();
  for (const log of logs) {
    for (let x = -2; x <= 2; x += 1) {
      for (let y = -2; y <= 2; y += 1) {
        for (let z = -2; z <= 2; z += 1) {
          const position = offset(log, x, y, z);
          const block = getBlock(position);
          if (isTreeLeaf(block, species)) leaves.set(key(position), blockPosition(block, position));
          if (leaves.size >= maximum) return [...leaves.values()];
        }
      }
    }
  }
  return [...leaves.values()];
}

function discoverTree(getBlock, origin, options = {}) {
  if (typeof getBlock !== 'function') throw new TypeError('A block reader is required.');
  const maximumLogs = Math.max(1, Math.min(4096, Number(options.maximumLogs) || 512));
  const maximumLeaves = Math.max(0, Math.min(8192, Number(options.maximumLeaves) || 2048));
  const maximumHorizontal = Math.max(4, Math.min(32, Number(options.maximumHorizontal) || 12));
  const maximumVertical = Math.max(8, Math.min(64, Number(options.maximumVertical) || 40));
  const seed = treeSeed(getBlock, origin);
  const queue = [seed.position];
  const visited = new Set();
  const logs = [];
  let truncated = false;
  while (queue.length) {
    const position = queue.shift();
    const value = key(position);
    if (visited.has(value)) continue;
    visited.add(value);
    const block = getBlock(position);
    if (treeSpecies(block) !== seed.species) continue;
    logs.push(blockPosition(block, position));
    if (logs.length >= maximumLogs) {
      truncated = queue.length > 0;
      break;
    }
    for (const [x, y, z] of ADJACENT) {
      const candidate = offset(position, x, y, z);
      if (Math.abs(candidate.x - seed.position.x) > maximumHorizontal || Math.abs(candidate.z - seed.position.z) > maximumHorizontal) continue;
      if (Math.abs(candidate.y - seed.position.y) > maximumVertical) continue;
      if (!visited.has(key(candidate))) queue.push(candidate);
    }
  }
  if (!logs.length) throw new Error('No tree logs were found at the selected block.');
  logs.sort((left, right) => left.y - right.y || left.x - right.x || left.z - right.z);
  const baseY = logs[0].y;
  const topY = logs.at(-1).y;
  const base = logs.filter((log) => log.y === baseY);
  const leaves = collectLeaves(getBlock, logs, seed.species, maximumLeaves);
  const supportedBase = base.filter((log) => {
    const below = getBlock(offset(log, 0, -1, 0));
    return below && !['air', 'cave_air', 'void_air'].includes(blockName(below));
  }).length;
  const height = topY - baseY + 1;
  const confidence = Math.min(1,
    (logs.length >= 3 ? 0.3 : 0.1) +
    (height >= 3 ? 0.15 : 0) +
    (leaves.length ? 0.35 : 0) +
    (supportedBase ? 0.15 : 0) +
    (base.length <= 4 ? 0.05 : 0));
  return {
    species: seed.species,
    origin: seed.position,
    logs,
    leaves,
    base,
    baseY,
    topY,
    height,
    truncated,
    confidence: Math.round(confidence * 100) / 100,
    natural: confidence >= 0.6 && !truncated
  };
}

function emptySpace(block) {
  const name = blockName(block);
  if (!block || ['air', 'cave_air', 'void_air'].includes(name)) return true;
  return block.boundingBox === 'empty' && !['water', 'flowing_water', 'lava', 'flowing_lava', 'bubble_column'].includes(name);
}

function solidSupport(block) {
  return Boolean(block) && !emptySpace(block) && !['water', 'flowing_water', 'lava', 'flowing_lava', 'bubble_column'].includes(blockName(block));
}

function leafIsStable(block, mode) {
  if (mode === 'always') return true;
  if (mode !== 'safe') return false;
  if (block?.getProperties?.().persistent === true) return true;
  return block?.properties?.persistent === true;
}

function candidateTreeStances(getBlock, tree, currentPosition, options = {}) {
  const reach = Math.max(3, Math.min(5.5, Number(options.reach) || 4.8));
  const leafSupport = String(options.leafSupport || 'safe');
  const logSupport = options.logSupport !== false;
  const targetKeys = new Set(tree.logs.map(key));
  const stands = new Map();
  const add = (position, kind, support = null) => {
    const stand = point(position);
    const feet = getBlock(stand);
    const headPosition = offset(stand, 0, 1, 0);
    const head = getBlock(headPosition);
    const clearance = [];
    if (!emptySpace(feet)) {
      if (!targetKeys.has(key(stand))) return;
      clearance.push(key(stand));
    }
    if (!emptySpace(head)) {
      if (!targetKeys.has(key(headPosition))) return;
      clearance.push(key(headPosition));
    }
    const supportKey = support && targetKeys.has(key(support)) ? key(support) : null;
    const eye = { x: stand.x + 0.5, y: stand.y + 1.62, z: stand.z + 0.5 };
    const coverage = tree.logs.filter((log) => key(log) !== supportKey && distance(eye, { x: log.x + 0.5, y: log.y + 0.5, z: log.z + 0.5 }) <= reach).map(key);
    if (!coverage.length) return;
    const value = key(stand);
    const risk = kind === 'leaf' ? 3 : kind === 'log' ? 0.75 : 0;
    const candidate = { key: value, position: stand, kind, supportKey, clearanceKeys: clearance, coverageKeys: coverage, risk };
    const previous = stands.get(value);
    if (!previous || candidate.risk < previous.risk) stands.set(value, candidate);
  };
  const current = point(currentPosition);
  const currentFloor = offset(current, 0, -1, 0);
  add(current, 'current', currentFloor);
  const xs = tree.logs.map((log) => log.x);
  const ys = tree.logs.map((log) => log.y);
  const zs = tree.logs.map((log) => log.z);
  const bounds = {
    minX: Math.min(...xs) - 4,
    maxX: Math.max(...xs) + 4,
    minY: Math.min(...ys) - 2,
    maxY: Math.min(...ys) + 3,
    minZ: Math.min(...zs) - 4,
    maxZ: Math.max(...zs) + 4
  };
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      for (let z = bounds.minZ; z <= bounds.maxZ; z += 1) {
        const position = { x, y, z };
        const floor = offset(position, 0, -1, 0);
        const support = getBlock(floor);
        if (solidSupport(support) && !isTreeLeaf(support) && !isTreeLog(support) && !targetKeys.has(key(floor))) add(position, 'ground');
      }
    }
  }
  if (logSupport) {
    for (const log of tree.logs) {
      if (log.y === tree.baseY) add(offset(log, 0, 1, 0), 'log', log);
    }
  }
  if (leafSupport !== 'never') {
    for (const leaf of tree.leaves) {
      const block = getBlock(leaf);
      if (isTreeLeaf(block, tree.species) && leafIsStable(block, leafSupport)) add(offset(leaf, 0, 1, 0), 'leaf', leaf);
    }
  }
  return [...stands.values()];
}

function bitCount(value) {
  let count = 0;
  for (let bits = value; bits; bits &= bits - 1n) count += 1;
  return count;
}

function stanceMasks(tree, stands) {
  const indexes = new Map(tree.logs.map((log, index) => [key(log), index]));
  const bit = (value) => indexes.has(value) ? 1n << BigInt(indexes.get(value)) : 0n;
  return stands.map((stand) => ({
    ...stand,
    coverageMask: stand.coverageKeys.reduce((mask, value) => mask | bit(value), 0n),
    clearanceMask: stand.clearanceKeys.reduce((mask, value) => mask | bit(value), 0n),
    supportMask: bit(stand.supportKey)
  })).filter((stand) => stand.coverageMask);
}

function applyStance(state, candidate, candidates) {
  if (candidate.clearanceMask & state.remaining) return null;
  if (candidate.supportMask && !(candidate.supportMask & state.remaining)) return null;
  let next = state.remaining & ~candidate.coverageMask;
  const uncovered = next;
  for (const future of candidates) {
    if (!future.supportMask || !(candidate.coverageMask & future.supportMask)) continue;
    if (future.clearanceMask & next) continue;
    if (future.coverageMask & uncovered) next |= future.supportMask;
  }
  if (next === state.remaining) return null;
  return next;
}

function planTreeRoute(tree, stands, start, options = {}) {
  const candidates = stanceMasks(tree, stands);
  const all = (1n << BigInt(tree.logs.length)) - 1n;
  const beamWidth = Math.max(8, Math.min(256, Number(options.beamWidth) || 72));
  const branchFactor = Math.max(4, Math.min(32, Number(options.branchFactor) || 12));
  const maximumSteps = Math.max(4, Math.min(48, Number(options.maximumSteps) || 24));
  let beam = [{ remaining: all, position: point(start), cost: 0, route: [] }];
  let best = beam[0];
  for (let depth = 0; depth < maximumSteps; depth += 1) {
    const nextStates = [];
    for (const state of beam) {
      const choices = candidates.map((candidate) => {
        const remaining = applyStance(state, candidate, candidates);
        if (remaining === null) return null;
        const removed = bitCount(state.remaining) - bitCount(remaining);
        const travel = distance(state.position, candidate.position);
        return { candidate, remaining, removed, travel, rank: removed / (1 + travel / 4 + candidate.risk) };
      }).filter(Boolean).sort((left, right) => right.rank - left.rank || right.removed - left.removed || left.travel - right.travel || left.candidate.key.localeCompare(right.candidate.key)).slice(0, branchFactor);
      for (const choice of choices) {
        const cost = state.cost + choice.travel + choice.candidate.risk + choice.removed * 0.2;
        const route = [...state.route, choice.candidate];
        const candidateState = { remaining: choice.remaining, position: choice.candidate.position, cost, route };
        if (!choice.remaining) return finalizeTreePlan(tree, route, start, cost);
        nextStates.push(candidateState);
        if (bitCount(candidateState.remaining) < bitCount(best.remaining) || bitCount(candidateState.remaining) === bitCount(best.remaining) && cost < best.cost) best = candidateState;
      }
    }
    if (!nextStates.length) break;
    const unique = new Map();
    for (const state of nextStates) {
      const value = `${state.remaining}:${key(state.position)}`;
      const score = state.cost + bitCount(state.remaining) * 0.75;
      if (!unique.has(value) || score < unique.get(value).score) unique.set(value, { state, score });
    }
    beam = [...unique.values()].sort((left, right) => left.score - right.score).slice(0, beamWidth).map((entry) => entry.state);
  }
  return finalizeTreePlan(tree, best.route, start, best.cost);
}

function finalizeTreePlan(tree, route, start, cost) {
  const remaining = new Set(tree.logs.map(key));
  const logs = new Map(tree.logs.map((log) => [key(log), log]));
  const steps = [];
  for (let index = 0; index < route.length; index += 1) {
    const candidate = route[index];
    if (candidate.supportKey && !remaining.has(candidate.supportKey)) continue;
    if (candidate.clearanceKeys.some((value) => remaining.has(value))) continue;
    const futureSupports = new Set(route.slice(index + 1).map((entry) => entry.supportKey).filter(Boolean));
    const blocks = candidate.coverageKeys.filter((value) => remaining.has(value) && !futureSupports.has(value)).map((value) => logs.get(value)).filter(Boolean)
      .sort((left, right) => right.y - left.y || distance(candidate.position, left) - distance(candidate.position, right) || key(left).localeCompare(key(right)));
    if (!blocks.length) continue;
    for (const block of blocks) remaining.delete(key(block));
    steps.push({ stand: candidate.position, kind: candidate.kind, supportKey: candidate.supportKey, blocks });
  }
  return {
    steps,
    unresolved: [...remaining].map((value) => logs.get(value)).filter(Boolean),
    covered: tree.logs.length - remaining.size,
    total: tree.logs.length,
    estimatedCost: Math.round(cost * 100) / 100,
    start: point(start)
  };
}

function planForestRoute(trees, start) {
  const remaining = trees.map((tree, index) => ({ tree, index }));
  const route = [];
  let current = point(start);
  let travelDistance = 0;
  while (remaining.length) {
    remaining.sort((left, right) => {
      const leftDistance = distance(current, left.tree.origin);
      const rightDistance = distance(current, right.tree.origin);
      const leftScore = left.tree.logs.length / (1 + leftDistance + left.tree.logs.length * 0.25);
      const rightScore = right.tree.logs.length / (1 + rightDistance + right.tree.logs.length * 0.25);
      return rightScore - leftScore || leftDistance - rightDistance || left.index - right.index;
    });
    const selected = remaining.shift();
    travelDistance += distance(current, selected.tree.origin);
    current = selected.tree.origin;
    route.push(selected.tree);
  }
  const optimized = optimizeForestRoute(route, start);
  return { route: optimized.route, travelDistance: optimized.travelDistance, improvement: Math.round((travelDistance - optimized.travelDistance) * 100) / 100 };
}

function forestTravelDistance(route, start) {
  let current = point(start);
  let total = 0;
  for (const tree of route) {
    total += distance(current, tree.origin);
    current = tree.origin;
  }
  return total;
}

function optimizeForestRoute(route, start, maximumPasses = 6) {
  const result = [...route];
  for (let pass = 0; pass < maximumPasses; pass += 1) {
    let improved = false;
    for (let left = 1; left < result.length - 1; left += 1) {
      for (let right = left + 1; right < result.length; right += 1) {
        const before = result[left - 1].origin;
        const first = result[left].origin;
        const last = result[right].origin;
        const after = result[right + 1]?.origin || null;
        const current = distance(before, first) + (after ? distance(last, after) : 0);
        const reversed = distance(before, last) + (after ? distance(first, after) : 0);
        if (reversed + 0.01 >= current) continue;
        result.splice(left, right - left + 1, ...result.slice(left, right + 1).reverse());
        improved = true;
      }
    }
    if (!improved) break;
  }
  return { route: result, travelDistance: forestTravelDistance(result, start) };
}

module.exports = {
  TREE_SPECIES,
  candidateTreeStances,
  discoverTree,
  emptySpace,
  isTreeLeaf,
  isTreeLog,
  leafSpecies,
  forestTravelDistance,
  optimizeForestRoute,
  planForestRoute,
  planTreeRoute,
  solidSupport,
  treeSpecies
};
