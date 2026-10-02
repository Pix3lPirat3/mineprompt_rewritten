'use strict';

const crypto = require('node:crypto');

const MAX_BLUEPRINT_AXIS = 512;
const MAX_BLUEPRINT_VOLUME = 16777216;
const MAX_BLUEPRINT_PALETTE = 65536;
const MAX_BLOCK_ENTITIES = 65536;
const MAX_BLOCK_ENTITY_BYTES = 4194304;

const AIR_NAMES = new Set(['air', 'cave_air', 'void_air']);
const ITEM_ALIASES = Object.freeze({
  redstone_wire: 'redstone',
  tripwire: 'string',
  wall_torch: 'torch',
  soul_wall_torch: 'soul_torch'
});

function dimensionValue(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > MAX_BLUEPRINT_AXIS) throw new Error(`${label} must be an integer from 1 to ${MAX_BLUEPRINT_AXIS}.`);
  return number;
}

function normalizeDimensions(value) {
  const dimensions = {
    x: dimensionValue(value?.x, 'Blueprint width'),
    y: dimensionValue(value?.y, 'Blueprint height'),
    z: dimensionValue(value?.z, 'Blueprint length')
  };
  const volume = dimensions.x * dimensions.y * dimensions.z;
  if (volume > MAX_BLUEPRINT_VOLUME) throw new Error(`Blueprints cannot exceed ${MAX_BLUEPRINT_VOLUME} blocks.`);
  return { ...dimensions, volume };
}

function normalizeOffset(value = {}) {
  const offset = { x: Number(value.x || 0), y: Number(value.y || 0), z: Number(value.z || 0) };
  if (![offset.x, offset.y, offset.z].every(Number.isInteger)) throw new Error('Blueprint offsets must contain integer coordinates.');
  if ([offset.x, offset.y, offset.z].some((entry) => Math.abs(entry) > MAX_BLUEPRINT_AXIS * 4)) throw new Error('Blueprint offsets are outside the supported range.');
  return offset;
}

function parseBlockState(value) {
  const text = String(value || '').trim().toLowerCase();
  const match = /^(?:([a-z0-9_.-]+):)?([a-z0-9_./-]+)(?:\[([^\]]*)\])?$/u.exec(text);
  if (!match) throw new Error(`Invalid block state: ${value}.`);
  const namespace = match[1] || 'minecraft';
  const name = match[2];
  const properties = {};
  if (match[3]) {
    for (const entry of match[3].split(',')) {
      const index = entry.indexOf('=');
      if (index <= 0 || index === entry.length - 1) throw new Error(`Invalid block state property: ${entry}.`);
      const key = entry.slice(0, index);
      const property = entry.slice(index + 1);
      if (!/^[a-z0-9_.-]+$/u.test(key) || !/^[a-z0-9_.-]+$/u.test(property) || Object.hasOwn(properties, key)) throw new Error(`Invalid block state property: ${entry}.`);
      properties[key] = property;
    }
  }
  return { namespace, name, properties };
}

function blockStateString(value) {
  const parsed = typeof value === 'string' ? parseBlockState(value) : value;
  const entries = Object.entries(parsed.properties || {}).sort(([left], [right]) => left.localeCompare(right));
  return `${parsed.namespace || 'minecraft'}:${parsed.name}${entries.length ? `[${entries.map(([key, property]) => `${key}=${property}`).join(',')}]` : ''}`;
}

function isAirState(value) {
  try {
    const block = parseBlockState(value);
    return block.namespace === 'minecraft' && AIR_NAMES.has(block.name);
  } catch {
    return false;
  }
}

function directionTransform(direction, rotation, mirror) {
  const directions = ['north', 'east', 'south', 'west'];
  let index = directions.indexOf(direction);
  if (index < 0) return direction;
  if (mirror === 'x' && ['east', 'west'].includes(direction)) index = (index + 2) % 4;
  if (mirror === 'z' && ['north', 'south'].includes(direction)) index = (index + 2) % 4;
  return directions[(index + rotation / 90) % 4];
}

function railShape(value, rotation, mirror) {
  const ascending = value.startsWith('ascending_');
  const raw = ascending ? value.slice(10) : value;
  const directions = raw.split('_');
  if (!directions.every((entry) => ['north', 'east', 'south', 'west'].includes(entry))) return value;
  const transformed = directions.map((entry) => directionTransform(entry, rotation, mirror));
  if (ascending) return `ascending_${transformed[0]}`;
  const set = new Set(transformed);
  if (set.has('north') && set.has('south')) return 'north_south';
  if (set.has('east') && set.has('west')) return 'east_west';
  for (const candidate of ['north_east', 'south_east', 'south_west', 'north_west']) {
    if (candidate.split('_').every((entry) => set.has(entry))) return candidate;
  }
  return value;
}

function orientationTransform(value, rotation, mirror) {
  const parts = value.split('_');
  if (parts.length !== 2) return value;
  return parts.map((part) => directionTransform(part, rotation, mirror)).join('_');
}

function transformBlockState(value, options = {}) {
  const rotation = normalizeRotation(options.rotation);
  const mirror = normalizeMirror(options.mirror);
  if (!rotation && mirror === 'none') return blockStateString(value);
  const parsed = parseBlockState(value);
  const transformed = {};
  for (const [key, property] of Object.entries(parsed.properties)) {
    if (['north', 'east', 'south', 'west'].includes(key)) {
      transformed[directionTransform(key, rotation, mirror)] = property;
      continue;
    }
    if (key === 'facing') {
      transformed[key] = directionTransform(property, rotation, mirror);
      continue;
    }
    if (key === 'axis' && ['x', 'z'].includes(property) && [90, 270].includes(rotation)) {
      transformed[key] = property === 'x' ? 'z' : 'x';
      continue;
    }
    if (key === 'rotation' && /^\d+$/u.test(property)) {
      let direction = Number(property) % 16;
      if (mirror === 'x') direction = (16 - direction) % 16;
      if (mirror === 'z') direction = (8 - direction + 16) % 16;
      transformed[key] = String((direction + rotation / 22.5) % 16);
      continue;
    }
    if (key === 'orientation') {
      transformed[key] = orientationTransform(property, rotation, mirror);
      continue;
    }
    if (key === 'shape' && (property.includes('north') || property.includes('south') || property.includes('east') || property.includes('west') || property.startsWith('ascending_'))) {
      transformed[key] = railShape(property, rotation, mirror);
      continue;
    }
    if (mirror !== 'none' && ['hinge', 'type', 'shape'].includes(key) && property.endsWith('left')) {
      transformed[key] = property.replace(/left$/u, 'right');
      continue;
    }
    if (mirror !== 'none' && ['hinge', 'type', 'shape'].includes(key) && property.endsWith('right')) {
      transformed[key] = property.replace(/right$/u, 'left');
      continue;
    }
    transformed[key] = property;
  }
  return blockStateString({ ...parsed, properties: transformed });
}

function normalizeRotation(value = 0) {
  const rotation = Number(value || 0);
  if (![0, 90, 180, 270].includes(rotation)) throw new Error('Blueprint rotation must be 0, 90, 180, or 270 degrees.');
  return rotation;
}

function normalizeMirror(value = 'none') {
  const mirror = String(value || 'none').toLowerCase();
  if (!['none', 'x', 'z'].includes(mirror)) throw new Error('Blueprint mirror must be none, x, or z.');
  return mirror;
}

function transformPosition(position, dimensions, options = {}) {
  const rotation = normalizeRotation(options.rotation);
  const mirror = normalizeMirror(options.mirror);
  let x = position.x;
  const y = position.y;
  let z = position.z;
  if (mirror === 'x') x = dimensions.x - 1 - x;
  if (mirror === 'z') z = dimensions.z - 1 - z;
  if (rotation === 90) return { x: dimensions.z - 1 - z, y, z: x };
  if (rotation === 180) return { x: dimensions.x - 1 - x, y, z: dimensions.z - 1 - z };
  if (rotation === 270) return { x: z, y, z: dimensions.x - 1 - x };
  return { x, y, z };
}

function transformVector(vector, options = {}) {
  const rotation = normalizeRotation(options.rotation);
  const mirror = normalizeMirror(options.mirror);
  let x = mirror === 'x' ? -vector.x : vector.x;
  const y = vector.y;
  let z = mirror === 'z' ? -vector.z : vector.z;
  if (rotation === 90) [x, z] = [-z, x];
  else if (rotation === 180) [x, z] = [-x, -z];
  else if (rotation === 270) [x, z] = [z, -x];
  return { x, y, z };
}

function transformOffset(offset, dimensions, options = {}) {
  const vector = transformVector(offset, options);
  const translation = transformPosition({ x: 0, y: 0, z: 0 }, dimensions, options);
  return { x: vector.x - translation.x, y: vector.y - translation.y, z: vector.z - translation.z };
}

function transformBlockEntity(entity, dimensions, options = {}) {
  const transformed = structuredClone(entity);
  const key = Array.isArray(transformed.Pos) ? 'Pos' : Array.isArray(transformed.pos) ? 'pos' : null;
  if (!key) return transformed;
  const position = transformPosition({ x: Number(transformed[key][0]), y: Number(transformed[key][1]), z: Number(transformed[key][2]) }, dimensions, options);
  transformed[key] = [position.x, position.y, position.z];
  return transformed;
}

function transformedDimensions(dimensions, rotation) {
  return [90, 270].includes(normalizeRotation(rotation))
    ? { x: dimensions.z, y: dimensions.y, z: dimensions.x }
    : { x: dimensions.x, y: dimensions.y, z: dimensions.z };
}

function blockIndex(position, dimensions) {
  return (position.y * dimensions.z + position.z) * dimensions.x + position.x;
}

function positionFromIndex(index, dimensions) {
  const x = index % dimensions.x;
  const layer = Math.floor(index / dimensions.x);
  const z = layer % dimensions.z;
  const y = Math.floor(layer / dimensions.z);
  return { x, y, z };
}

function transformBlueprint(blueprint, options = {}) {
  const rotation = normalizeRotation(options.rotation);
  const mirror = normalizeMirror(options.mirror);
  if ((rotation || mirror !== 'none') && blueprint.sourceFormat === 'mcedit') throw new Error('Legacy MCEdit blueprint rotation and mirroring are not supported because numeric metadata cannot be transformed safely.');
  const dimensions = transformedDimensions(blueprint.dimensions, rotation);
  const palette = blueprint.palette.map((entry) => {
    const state = transformBlockState(entry.state, { rotation, mirror });
    return { ...entry, state, stateId: state === entry.state ? entry.stateId : null };
  });
  const blocks = new Array(blueprint.blocks.length);
  for (let index = 0; index < blueprint.blocks.length; index += 1) {
    const position = positionFromIndex(index, blueprint.dimensions);
    blocks[blockIndex(transformPosition(position, blueprint.dimensions, { rotation, mirror }), dimensions)] = blueprint.blocks[index];
  }
  return {
    ...blueprint,
    dimensions,
    offset: transformOffset(blueprint.offset, blueprint.dimensions, { rotation, mirror }),
    palette,
    blocks,
    blockEntities: (blueprint.blockEntities || []).map((entity) => transformBlockEntity(entity, blueprint.dimensions, { rotation, mirror })),
    transform: { rotation, mirror }
  };
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
}

function canonicalBlueprint(value) {
  return JSON.stringify(canonicalValue({
    schemaVersion: 1,
    edition: value.edition,
    version: value.version,
    dimensions: value.dimensions,
    offset: value.offset,
    palette: value.palette.map((entry) => entry.state),
    blocks: value.blocks,
    blockEntities: value.blockEntities
  }));
}

function blueprintHash(value) {
  return crypto.createHash('sha256').update(canonicalBlueprint(value)).digest('hex');
}

function blueprintSummary(blueprint) {
  return {
    id: blueprint.id,
    hash: blueprint.hash,
    name: blueprint.name,
    sourceFile: blueprint.sourceFile,
    sourceFormat: blueprint.sourceFormat,
    edition: blueprint.edition,
    version: blueprint.version,
    detectedVersion: blueprint.detectedVersion,
    dimensions: { ...blueprint.dimensions },
    volume: blueprint.volume,
    offset: { ...blueprint.offset },
    paletteSize: blueprint.palette.length,
    blockEntityCount: blueprint.blockEntities.length,
    materialTypes: blueprint.materials.length,
    materialCount: blueprint.materials.reduce((sum, entry) => sum + entry.count, 0),
    unsupportedCount: blueprint.unsupportedBlocks.length,
    supportSensitiveCount: blueprint.supportSensitiveBlocks.length,
    importedAt: blueprint.importedAt
  };
}

function validateStoredBlueprint(value) {
  if (!value || typeof value !== 'object' || value.schemaVersion !== 1) throw new Error('The stored blueprint has an unsupported schema.');
  if (!/^[a-f0-9]{64}$/u.test(value.hash) || value.id !== value.hash.slice(0, 16)) throw new Error('The stored blueprint identity is invalid.');
  if (!Array.isArray(value.palette) || !Array.isArray(value.blocks) || !Array.isArray(value.blockEntities)) throw new Error('The stored blueprint is incomplete.');
  const dimensions = normalizeDimensions(value.dimensions);
  normalizeOffset(value.offset);
  if (value.volume !== dimensions.volume || value.blocks.length !== dimensions.volume) throw new Error('The stored blueprint dimensions do not match its block data.');
  if (!value.palette.length || value.palette.length > MAX_BLUEPRINT_PALETTE) throw new Error('The stored blueprint palette size is invalid.');
  for (const entry of value.palette) {
    if (!entry || typeof entry !== 'object' || blockStateString(entry.state) !== entry.state) throw new Error('The stored blueprint contains an invalid block state.');
  }
  if (value.blocks.some((entry) => !Number.isInteger(entry) || entry < 0 || entry >= value.palette.length)) throw new Error('The stored blueprint references an invalid palette entry.');
  if (value.blockEntities.length > MAX_BLOCK_ENTITIES || Buffer.byteLength(JSON.stringify(value.blockEntities)) > MAX_BLOCK_ENTITY_BYTES) throw new Error('The stored blueprint block entity data is too large.');
  for (const entity of value.blockEntities) {
    const position = Array.isArray(entity?.Pos) ? entity.Pos : Array.isArray(entity?.pos) ? entity.pos : null;
    if (value.sourceFormat?.startsWith('sponge-') && !position) throw new Error('A stored blueprint block entity is missing its position.');
    if (position && (position.length !== 3 || position.some((entry) => !Number.isInteger(Number(entry))) || Number(position[0]) < 0 || Number(position[0]) >= dimensions.x || Number(position[1]) < 0 || Number(position[1]) >= dimensions.y || Number(position[2]) < 0 || Number(position[2]) >= dimensions.z)) throw new Error('A stored blueprint block entity has an invalid position.');
  }
  if (typeof value.name !== 'string' || !value.name || value.name.length > 96 || value.edition !== 'java' || typeof value.version !== 'string' || !value.version || value.version.length > 32) throw new Error('The stored blueprint metadata is invalid.');
  if (!/^(?:sponge-v[1-3]|mcedit)$/u.test(value.sourceFormat) || typeof value.sourceFile !== 'string' || value.sourceFile.length > 260 || /[\\/]/u.test(value.sourceFile) || !Number.isFinite(value.importedAt)) throw new Error('The stored blueprint source metadata is invalid.');
  if (!Array.isArray(value.materials) || !Array.isArray(value.unsupportedBlocks) || !Array.isArray(value.supportSensitiveBlocks)) throw new Error('The stored blueprint indexes are incomplete.');
  if (blueprintHash(value) !== value.hash) throw new Error('The stored blueprint content hash does not match its payload.');
  return value;
}

function materialBill(palette, blocks) {
  const counts = new Map();
  for (const paletteIndex of blocks) {
    const entry = palette[paletteIndex];
    if (!entry || entry.air || !entry.item) continue;
    const current = counts.get(entry.item) || { name: entry.item, displayName: entry.itemDisplayName || entry.displayName || entry.item, count: 0 };
    current.count += 1;
    counts.set(entry.item, current);
  }
  return [...counts.values()].sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
}

function placementItemName(blockName) {
  if (ITEM_ALIASES[blockName]) return ITEM_ALIASES[blockName];
  if (blockName.endsWith('_wall_sign')) return blockName.replace('_wall_sign', '_sign');
  if (blockName.endsWith('_wall_hanging_sign')) return blockName.replace('_wall_hanging_sign', '_hanging_sign');
  if (blockName.endsWith('_wall_banner')) return blockName.replace('_wall_banner', '_banner');
  return blockName;
}

function needsPlacementSupport(name, properties = {}) {
  return ['facing', 'face', 'half', 'hinge', 'shape', 'attachment'].some((key) => Object.hasOwn(properties, key)) ||
    /(?:torch|rail|button|lever|door|bed|sign|banner|ladder|vine|carpet|pressure_plate|repeater|comparator|tripwire|candle|lantern|bell|anvil|sand|gravel|concrete_powder|sapling|flower|mushroom|crop|wheat|potatoes|carrots|beetroots|cocoa|sugar_cane|cactus|bamboo|kelp)$/u.test(name);
}

module.exports = {
  AIR_NAMES,
  MAX_BLOCK_ENTITIES,
  MAX_BLOCK_ENTITY_BYTES,
  MAX_BLUEPRINT_AXIS,
  MAX_BLUEPRINT_PALETTE,
  MAX_BLUEPRINT_VOLUME,
  blockIndex,
  blockStateString,
  blueprintHash,
  blueprintSummary,
  canonicalValue,
  canonicalBlueprint,
  directionTransform,
  isAirState,
  materialBill,
  needsPlacementSupport,
  normalizeDimensions,
  normalizeMirror,
  normalizeOffset,
  normalizeRotation,
  orientationTransform,
  parseBlockState,
  placementItemName,
  positionFromIndex,
  transformBlockState,
  transformBlockEntity,
  transformBlueprint,
  transformOffset,
  transformPosition,
  transformVector,
  transformedDimensions,
  validateStoredBlueprint
};
