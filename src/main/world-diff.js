'use strict';

const { setImmediate: yieldEventLoop } = require('node:timers/promises');
const { Vec3 } = require('vec3');
const { blockStateString, isAirState, parseBlockState, positionFromIndex, transformBlueprint } = require('./blueprint-model');
const { normalizeBuildPolicy } = require('./build-policy');

const REPLACEABLE_BLOCKS = new Set(['air', 'cave_air', 'void_air', 'grass', 'short_grass', 'tall_grass', 'fern', 'large_fern', 'dead_bush', 'snow', 'vine', 'water', 'lava']);
const SAMPLE_LIMIT = 128;

function blockStateFromWorld(block, cache = null) {
  if (!block?.name) return null;
  if (cache && Number.isInteger(block.stateId) && cache.has(block.stateId)) return cache.get(block.stateId);
  let properties = {};
  try { properties = block.getProperties?.() || {}; } catch {}
  const state = blockStateString({
    namespace: 'minecraft',
    name: block.name,
    properties: Object.fromEntries(Object.entries(properties).map(([key, value]) => [key, String(value).toLowerCase()]))
  });
  if (cache && Number.isInteger(block.stateId)) cache.set(block.stateId, state);
  return state;
}

function blocksMatch(entry, block, sameVersion, cache = null) {
  if (!block) return false;
  if (sameVersion && entry.legacy && Number.isInteger(block.type)) return entry.legacy.id === block.type && entry.legacy.metadata === (Number(block.metadata) || 0);
  return entry.state === blockStateFromWorld(block, cache);
}

function entrySupportedByRegistry(bot, entry) {
  if (entry.air) return true;
  const registry = bot.registry;
  if (!registry?.blocksByName || !registry?.itemsByName) return entry.supported;
  if (entry.namespace !== 'minecraft' || !registry.blocksByName[entry.name] || !entry.item) return false;
  return Boolean(registry.itemsByName[entry.item]);
}

function entityPositions(bot) {
  const positions = new Set();
  for (const entity of Object.values(bot.entities || {})) {
    if (!entity?.position || entity.isValid === false) continue;
    const position = entity.position.floored?.() || entity.position;
    positions.add(`${Math.floor(position.x)},${Math.floor(position.y)},${Math.floor(position.z)}`);
  }
  return positions;
}

function inventoryItemCounts(bot) {
  const counts = new Map();
  for (const item of bot.inventory?.items?.() || []) counts.set(item.name, (counts.get(item.name) || 0) + (Number(item.count) || 0));
  return counts;
}

function addSample(samples, kind, record) {
  if (samples[kind].length < SAMPLE_LIMIT) samples[kind].push(record);
}

function addCount(map, key, count = 1) {
  map.set(key, (map.get(key) || 0) + count);
}

function targetPosition(anchor, offset, local) {
  return { x: anchor.x + offset.x + local.x, y: anchor.y + offset.y + local.y, z: anchor.z + offset.z + local.z };
}

function normalizeAnchor(value) {
  const anchor = { x: Number(value?.x), y: Number(value?.y), z: Number(value?.z) };
  if (![anchor.x, anchor.y, anchor.z].every(Number.isFinite)) throw new Error('A finite build anchor is required.');
  return { x: Math.floor(anchor.x), y: Math.floor(anchor.y), z: Math.floor(anchor.z) };
}

function publicCounts(counts) {
  return Object.fromEntries(Object.entries(counts));
}

async function diffBlueprint(bot, blueprint, request = {}) {
  if (!bot?.entity) throw new Error('An active connection is required for a world preview.');
  const anchor = normalizeAnchor(request.anchor || request.at);
  const policy = normalizeBuildPolicy(request.policy);
  const transformed = transformBlueprint(blueprint, { rotation: request.rotation, mirror: request.mirror });
  const sameVersion = String(bot.version || '') === String(blueprint.version || '');
  const warnings = sameVersion ? [] : [`Blueprint targets Minecraft ${blueprint.version}, but the connected server reports ${bot.version || 'an unknown version'}. No conversion was applied.`];
  const bounds = {
    from: targetPosition(anchor, transformed.offset, { x: 0, y: 0, z: 0 }),
    to: targetPosition(anchor, transformed.offset, { x: transformed.dimensions.x - 1, y: transformed.dimensions.y - 1, z: transformed.dimensions.z - 1 })
  };
  const distance = bot.entity.position.distanceTo(new Vec3(anchor.x, anchor.y, anchor.z));
  if (distance > policy.maximumRange) throw new Error(`The build anchor is ${Math.round(distance)} blocks away, beyond the ${policy.maximumRange} block policy limit.`);
  const counts = { correct: 0, ignoredAir: 0, placeable: 0, replaceable: 0, conflicting: 0, temporarilyObstructed: 0, unknown: 0, unsupported: 0 };
  const samples = Object.fromEntries(Object.keys(counts).map((key) => [key, []]));
  const requirements = new Map();
  const removals = new Map();
  const occupied = entityPositions(bot);
  const stateCache = new Map();
  let replacements = 0;
  for (let index = 0; index < transformed.blocks.length; index += 1) {
    if (index && index % 4096 === 0) await yieldEventLoop();
    const entry = transformed.palette[transformed.blocks[index]];
    const local = positionFromIndex(index, transformed.dimensions);
    const position = targetPosition(anchor, transformed.offset, local);
    const expectedAir = entry.air || isAirState(entry.state);
    const block = bot.blockAt(new Vec3(position.x, position.y, position.z));
    const record = { position, expected: entry.state, current: blockStateFromWorld(block, stateCache) };
    if (!block) {
      counts.unknown += 1;
      addSample(samples, 'unknown', record);
      continue;
    }
    if (blocksMatch(entry, block, sameVersion, stateCache)) {
      counts.correct += 1;
      addSample(samples, 'correct', record);
      continue;
    }
    if (expectedAir && policy.air === 'ignore') {
      counts.ignoredAir += 1;
      addSample(samples, 'ignoredAir', record);
      continue;
    }
    if (!expectedAir && !entrySupportedByRegistry(bot, entry)) {
      counts.unsupported += 1;
      addSample(samples, 'unsupported', record);
      continue;
    }
    const currentAir = REPLACEABLE_BLOCKS.has(block.name) && ['air', 'cave_air', 'void_air'].includes(block.name);
    const key = `${position.x},${position.y},${position.z}`;
    if (!expectedAir && currentAir) {
      if (occupied.has(key)) {
        counts.temporarilyObstructed += 1;
        addSample(samples, 'temporarilyObstructed', record);
      } else {
        counts.placeable += 1;
        addSample(samples, 'placeable', record);
      }
      if (entry.item) addCount(requirements, entry.item);
      continue;
    }
    const protectedBlock = policy.protectedBlocks.includes(block.name) || block.diggable === false;
    const mayReplace = !protectedBlock && replacements < policy.maximumReplacements &&
      (policy.conflicts === 'replace' || policy.terrain === 'replace' || policy.terrain === 'flatten' || REPLACEABLE_BLOCKS.has(block.name));
    if (mayReplace) {
      replacements += 1;
      counts.replaceable += 1;
      addCount(removals, block.name);
      if (!expectedAir && entry.item) addCount(requirements, entry.item);
      addSample(samples, 'replaceable', record);
    } else {
      counts.conflicting += 1;
      addSample(samples, 'conflicting', record);
    }
  }
  const inventory = inventoryItemCounts(bot);
  const requirementList = [...requirements.entries()].map(([name, count]) => ({ name, count, available: inventory.get(name) || 0, missing: Math.max(0, count - (inventory.get(name) || 0)) }));
  return {
    blueprint: { id: blueprint.id, hash: blueprint.hash, name: blueprint.name, edition: blueprint.edition, version: blueprint.version },
    anchor,
    transform: transformed.transform,
    dimensions: transformed.dimensions,
    offset: transformed.offset,
    bounds,
    policy,
    warnings,
    counts: publicCounts(counts),
    requirements: requirementList.sort((left, right) => right.count - left.count || left.name.localeCompare(right.name)),
    missing: requirementList.filter((entry) => entry.missing > 0).sort((left, right) => right.missing - left.missing || left.name.localeCompare(right.name)),
    removals: [...removals.entries()].map(([name, count]) => ({ name, count })).sort((left, right) => right.count - left.count || left.name.localeCompare(right.name)),
    samples
  };
}

module.exports = { REPLACEABLE_BLOCKS, SAMPLE_LIMIT, blockStateFromWorld, blocksMatch, diffBlueprint, entityPositions, entrySupportedByRegistry, inventoryItemCounts, normalizeAnchor, targetPosition };
