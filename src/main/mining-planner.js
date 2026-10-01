'use strict';

const { Vec3 } = require('vec3');

const FLUIDS = new Set(['water', 'flowing_water', 'lava', 'flowing_lava', 'bubble_column']);
const FALLING = new Set(['sand', 'red_sand', 'gravel', 'anvil', 'chipped_anvil', 'damaged_anvil', 'dragon_egg']);
const NEIGHBORS = Object.freeze([[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]);

function point(value) {
  if (!value || ![value.x, value.y, value.z].every(Number.isFinite)) throw new TypeError('A finite x, y, z position is required.');
  return { x: Math.trunc(value.x), y: Math.trunc(value.y), z: Math.trunc(value.z) };
}

function key(value) {
  return `${value.x},${value.y},${value.z}`;
}

function distance(left, right) {
  return Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);
}

function normalizeRegion(first, second, maximum = 4096) {
  const a = point(first);
  const b = point(second);
  const min = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), z: Math.min(a.z, b.z) };
  const max = { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), z: Math.max(a.z, b.z) };
  const size = (max.x - min.x + 1) * (max.y - min.y + 1) * (max.z - min.z + 1);
  if (size > maximum) throw new RangeError(`The region contains ${size} blocks. The configured limit is ${maximum}.`);
  return Object.freeze({ min, max, size });
}

function regionPositions(region) {
  const positions = [];
  for (let y = region.max.y; y >= region.min.y; y -= 1) {
    for (let x = region.min.x; x <= region.max.x; x += 1) {
      const reverse = (region.max.y - y + x - region.min.x) % 2 === 1;
      for (let offset = 0; offset <= region.max.z - region.min.z; offset += 1) {
        const z = reverse ? region.max.z - offset : region.min.z + offset;
        positions.push({ x, y, z });
      }
    }
  }
  return positions;
}

function isFluid(block) {
  return FLUIDS.has(String(block?.name || '').toLowerCase());
}

function isEmpty(block) {
  return !block || ['air', 'cave_air', 'void_air'].includes(block.name);
}

function blockHazard(bot, block, policy) {
  if (!block || isEmpty(block)) return 'empty';
  if (isFluid(block)) return 'fluid';
  if (block.diggable === false) return 'not-diggable';
  if (!policy.allowFalling) {
    const above = bot.blockAt(block.position.offset(0, 1, 0));
    if (FALLING.has(String(above?.name || '').toLowerCase())) return 'falling-block';
  }
  if (!policy.allowFluidAdjacent) {
    for (const [x, y, z] of NEIGHBORS) {
      if (isFluid(bot.blockAt(block.position.offset(x, y, z)))) return 'fluid-edge';
    }
  }
  return null;
}

function safeStand(bot, position) {
  const feet = bot.blockAt(position);
  const head = bot.blockAt(position.offset(0, 1, 0));
  const floor = bot.blockAt(position.offset(0, -1, 0));
  if (!isEmpty(feet) || !isEmpty(head) || isEmpty(floor) || isFluid(floor)) return false;
  for (const [x, y, z] of NEIGHBORS) {
    if (isFluid(bot.blockAt(position.offset(x, y, z)))) return false;
  }
  return true;
}

function planReachRoute(targets, stands, start, reach = 4.8) {
  const unresolved = new Map(targets.map((target) => [key(target), point(target)]));
  const requested = unresolved.size;
  const available = stands.map(point).filter((stand, index, all) => all.findIndex((candidate) => key(candidate) === key(stand)) === index);
  const route = [];
  let current = point(start);
  let travelDistance = 0;
  while (unresolved.size) {
    const options = rankReachOptions([...unresolved.values()], available, current, reach);
    if (!options.length) break;
    options.sort((left, right) => right.score - left.score || right.covered.length - left.covered.length || left.travel - right.travel || key(left.stand).localeCompare(key(right.stand)));
    const selected = options[0];
    const blocks = selected.covered.sort((left, right) => right.y - left.y || distance(selected.stand, left) - distance(selected.stand, right));
    route.push({ stand: selected.stand, blocks });
    travelDistance += selected.travel;
    current = selected.stand;
    for (const block of blocks) unresolved.delete(key(block));
  }
  return Object.freeze({ route, travelDistance, covered: requested - unresolved.size, unresolved: [...unresolved.values()] });
}

function rankReachOptions(targets, stands, start, reach = 4.8) {
  return stands.map((stand) => {
    const eye = { x: stand.x + 0.5, y: stand.y + 1.62, z: stand.z + 0.5 };
    const covered = targets.filter((target) => distance(eye, { x: target.x + 0.5, y: target.y + 0.5, z: target.z + 0.5 }) <= reach);
    const travel = distance(start, stand);
    const score = covered.length ? covered.length / (1 + travel / 4) : Number.NEGATIVE_INFINITY;
    return { stand, covered, travel, score };
  }).filter((option) => option.covered.length).sort((left, right) => right.score - left.score || right.covered.length - left.covered.length || left.travel - right.travel || key(left.stand).localeCompare(key(right.stand)));
}

function candidateStands(bot, region) {
  const stands = [];
  const padding = 4;
  for (let y = region.min.y - 1; y <= region.max.y + 1; y += 1) {
    for (let x = region.min.x - padding; x <= region.max.x + padding; x += 1) {
      for (let z = region.min.z - padding; z <= region.max.z + padding; z += 1) {
        const position = new Vec3(x, y, z);
        if (safeStand(bot, position)) stands.push({ x, y, z });
      }
    }
  }
  const current = point(bot.entity.position);
  if (!stands.some((stand) => key(stand) === key(current)) && safeStand(bot, bot.entity.position.floored())) stands.unshift(current);
  return stands;
}

module.exports = { FALLING, FLUIDS, blockHazard, candidateStands, distance, isEmpty, isFluid, key, normalizeRegion, planReachRoute, point, rankReachOptions, regionPositions, safeStand };
