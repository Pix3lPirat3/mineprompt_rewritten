'use strict';

const nbt = require('prismarine-nbt');
const minecraftData = require('minecraft-data');
const loadBlock = require('prismarine-block');
const { gunzipSync } = require('node:zlib');
const {
  MAX_BLOCK_ENTITIES,
  MAX_BLOCK_ENTITY_BYTES,
  MAX_BLUEPRINT_PALETTE,
  blockStateString,
  blueprintHash,
  isAirState,
  materialBill,
  needsPlacementSupport,
  normalizeDimensions,
  normalizeOffset,
  parseBlockState,
  placementItemName
} = require('./blueprint-model');

const MAX_BLUEPRINT_FILE_BYTES = 67108864;
const MAX_BLUEPRINT_DECOMPRESSED_BYTES = 134217728;

function byteValues(value, label) {
  if (!Buffer.isBuffer(value) && !Array.isArray(value) && !ArrayBuffer.isView(value)) throw new Error(`${label} must be a byte array.`);
  return Array.from(value, (entry) => Number(entry) & 255);
}

function decodeVarints(value, expected) {
  const bytes = byteValues(value, 'Schematic block data');
  const values = [];
  let current = 0;
  let shift = 0;
  for (const byte of bytes) {
    current |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) {
      values.push(current >>> 0);
      current = 0;
      shift = 0;
      if (values.length > expected) throw new Error('Schematic block data exceeds its declared volume.');
    } else {
      shift += 7;
      if (shift > 28) throw new Error('Schematic block data contains an oversized palette index.');
    }
  }
  if (shift !== 0) throw new Error('Schematic block data ends inside a palette index.');
  if (values.length !== expected) throw new Error(`Schematic block data contains ${values.length} entries but ${expected} are required.`);
  return values;
}

function minecraftVersionForDataVersion(dataVersion) {
  const target = Number(dataVersion);
  if (!Number.isInteger(target)) return null;
  const versions = minecraftData.versions?.pc || [];
  const match = versions.find((entry) => entry.dataVersion === target && entry.releaseType === 'release') || versions.find((entry) => entry.dataVersion === target);
  return match?.minecraftVersion || null;
}

function loadVersion(version) {
  try {
    const data = minecraftData(version);
    const Block = loadBlock(version);
    return data && Block ? { data, Block } : null;
  } catch {
    return null;
  }
}

function paletteEntry(state, versionTools, legacy = null) {
  const parsed = parseBlockState(state);
  const normalizedState = blockStateString(parsed);
  const air = parsed.namespace === 'minecraft' && isAirState(normalizedState);
  const itemName = placementItemName(parsed.name);
  const item = parsed.namespace === 'minecraft' ? versionTools?.data?.itemsByName?.[itemName] : null;
  let block = legacy?.block || null;
  try { block ||= versionTools?.Block?.fromString(normalizedState, 0) || null; } catch {}
  return {
    state: normalizedState,
    namespace: parsed.namespace,
    name: parsed.name,
    displayName: block?.displayName || item?.displayName || parsed.name,
    stateId: Number.isInteger(block?.stateId) ? block.stateId : null,
    item: item?.name || null,
    itemDisplayName: item?.displayName || null,
    air,
    supported: air || Boolean(block && item),
    needsSupport: !air && needsPlacementSupport(parsed.name, parsed.properties),
    ...(legacy ? { legacy: { id: legacy.id, metadata: legacy.metadata } } : {})
  };
}

function normalizePalette(value, versionTools) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Schematic palette is missing.');
  const entries = Object.entries(value);
  if (!entries.length || entries.length > MAX_BLUEPRINT_PALETTE) throw new Error(`Schematic palettes must contain 1 to ${MAX_BLUEPRINT_PALETTE} entries.`);
  const palette = new Array(entries.length);
  for (const [state, rawIndex] of entries) {
    const index = Number(rawIndex);
    if (!Number.isInteger(index) || index < 0 || index >= entries.length || palette[index]) throw new Error('Schematic palette indexes must be unique and contiguous.');
    palette[index] = paletteEntry(state, versionTools);
  }
  if (palette.some((entry) => !entry)) throw new Error('Schematic palette indexes must be contiguous.');
  return palette;
}

function boundedBlockEntities(value, dimensions, options = {}) {
  const entities = Array.isArray(value) ? value : [];
  if (entities.length > MAX_BLOCK_ENTITIES) throw new Error(`Blueprints cannot contain more than ${MAX_BLOCK_ENTITIES} block entities.`);
  let encoded;
  try { encoded = JSON.stringify(entities); } catch { throw new Error('Schematic block entities are not serializable.'); }
  if (Buffer.byteLength(encoded) > MAX_BLOCK_ENTITY_BYTES) throw new Error(`Schematic block entities cannot exceed ${MAX_BLOCK_ENTITY_BYTES} bytes.`);
  for (const entity of entities) {
    const position = Array.isArray(entity?.Pos) ? entity.Pos : Array.isArray(entity?.pos) ? entity.pos : null;
    if (!position && options.requirePosition) throw new Error('A schematic block entity is missing its position.');
    if (position && (position.length !== 3 || position.some((entry) => !Number.isInteger(Number(entry))) || Number(position[0]) < 0 || Number(position[0]) >= dimensions.x || Number(position[1]) < 0 || Number(position[1]) >= dimensions.y || Number(position[2]) < 0 || Number(position[2]) >= dimensions.z)) {
      throw new Error('A schematic block entity has an invalid position.');
    }
  }
  return JSON.parse(encoded);
}

function spongeRoot(root) {
  if (root?.Schematic && typeof root.Schematic === 'object') return root.Schematic;
  return root;
}

function parseSponge(root, options) {
  const source = spongeRoot(root);
  const formatVersion = Number(source.Version || source.SchematicVersion || 1);
  const blockContainer = source.Blocks && typeof source.Blocks === 'object' && !Array.isArray(source.Blocks) ? source.Blocks : source;
  const rawPalette = blockContainer.Palette || source.Palette;
  const rawBlocks = blockContainer.Data || source.BlockData;
  if (!rawPalette || !rawBlocks) return null;
  if (!Number.isInteger(formatVersion) || formatVersion < 1 || formatVersion > 3) throw new Error(`Unsupported Sponge schematic version ${formatVersion}.`);
  const dimensions = normalizeDimensions({ x: source.Width, y: source.Height, z: source.Length });
  const detectedVersion = minecraftVersionForDataVersion(source.DataVersion);
  const version = String(options.version || detectedVersion || '').trim();
  if (!version) throw new Error('A Minecraft version is required because this schematic does not declare a recognized data version.');
  const versionTools = loadVersion(version);
  if (!versionTools) throw new Error(`Minecraft ${version} is not available for schematic validation.`);
  const palette = normalizePalette(rawPalette, versionTools);
  const blocks = decodeVarints(rawBlocks, dimensions.volume);
  if (blocks.some((index) => index >= palette.length)) throw new Error('Schematic block data references a missing palette entry.');
  const blockEntities = boundedBlockEntities(blockContainer.BlockEntities || source.BlockEntities || source.TileEntities, dimensions, { requirePosition: true });
  return {
    format: `sponge-v${formatVersion}`,
    version,
    detectedVersion,
    dimensions,
    offset: normalizeOffset({ x: source.Offset?.[0], y: source.Offset?.[1], z: source.Offset?.[2] }),
    palette,
    blocks,
    blockEntities,
    metadata: source.Metadata && typeof source.Metadata === 'object' ? source.Metadata : {}
  };
}

function legacyState(block) {
  const properties = block?.getProperties?.() || {};
  const entries = Object.entries(properties).sort(([left], [right]) => left.localeCompare(right));
  if (!entries.length && Number(block.metadata)) entries.push(['legacy_metadata', Number(block.metadata)]);
  return `minecraft:${block.name}${entries.length ? `[${entries.map(([key, value]) => `${key}=${String(value).toLowerCase()}`).join(',')}]` : ''}`;
}

function parseMcedit(root, options) {
  if (!root?.Blocks || !root?.Data) return null;
  const version = String(options.version || '').trim();
  if (!version) throw new Error('Legacy MCEdit schematics require an explicit Minecraft version.');
  const dimensions = normalizeDimensions({ x: root.Width, y: root.Height, z: root.Length });
  const ids = byteValues(root.Blocks, 'Legacy schematic blocks');
  const metadata = byteValues(root.Data, 'Legacy schematic metadata');
  const highBits = root.AddBlocks ? byteValues(root.AddBlocks, 'Legacy schematic high block ids') : [];
  if (ids.length !== dimensions.volume || metadata.length !== dimensions.volume) throw new Error('Legacy schematic block arrays do not match the declared volume.');
  if (highBits.length && highBits.length !== Math.ceil(dimensions.volume / 2)) throw new Error('Legacy schematic high block ids do not match the declared volume.');
  const versionTools = loadVersion(version);
  if (!versionTools) throw new Error(`Minecraft ${version} is not available for legacy numeric block decoding.`);
  const palette = [];
  const indexes = new Map();
  const blocks = ids.map((low, index) => {
    const packed = highBits[index >> 1] || 0;
    const high = index & 1 ? packed >> 4 & 15 : packed & 15;
    const id = low | high << 8;
    const data = metadata[index] & 15;
    const key = `${id}:${data}`;
    if (indexes.has(key)) return indexes.get(key);
    let block;
    try { block = new versionTools.Block(id, 0, data); } catch { throw new Error(`Legacy block ${id}:${data} is not valid in Minecraft ${version}.`); }
    if (!block?.name) throw new Error(`Legacy block ${id}:${data} is not valid in Minecraft ${version}.`);
    const paletteIndex = palette.length;
    if (paletteIndex >= MAX_BLUEPRINT_PALETTE) throw new Error(`Schematic palettes cannot exceed ${MAX_BLUEPRINT_PALETTE} entries.`);
    indexes.set(key, paletteIndex);
    palette.push(paletteEntry(legacyState(block), versionTools, { id, metadata: data, block }));
    return paletteIndex;
  });
  return {
    format: 'mcedit',
    version,
    detectedVersion: null,
    dimensions,
    offset: normalizeOffset({ x: root.WEOffsetX, y: root.WEOffsetY, z: root.WEOffsetZ }),
    palette,
    blocks,
    blockEntities: boundedBlockEntities(root.TileEntities, dimensions),
    metadata: {}
  };
}

function decodeNbt(buffer) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('A schematic buffer is required.');
  if (!buffer.length || buffer.length > MAX_BLUEPRINT_FILE_BYTES) throw new Error(`Schematic files must contain 1 to ${MAX_BLUEPRINT_FILE_BYTES} bytes.`);
  let decoded = buffer;
  if (buffer[0] === 0x1f && buffer[1] === 0x8b) decoded = gunzipSync(buffer, { maxOutputLength: MAX_BLUEPRINT_DECOMPRESSED_BYTES });
  if (decoded.length > MAX_BLUEPRINT_DECOMPRESSED_BYTES) throw new Error(`Decompressed schematics cannot exceed ${MAX_BLUEPRINT_DECOMPRESSED_BYTES} bytes.`);
  return nbt.simplify(nbt.parseUncompressed(decoded));
}

function importedBlueprint(buffer, options = {}) {
  const root = decodeNbt(buffer);
  const parsed = parseSponge(root, options) || parseMcedit(root, options);
  if (!parsed) throw new Error('The file is not a supported Sponge or legacy MCEdit schematic.');
  const edition = String(options.edition || 'java').toLowerCase();
  if (edition !== 'java') throw new Error('Sponge and legacy MCEdit schematics currently support Java Edition only.');
  const name = String(options.name || parsed.metadata.Name || 'Imported blueprint').trim().slice(0, 96);
  if (!name) throw new Error('A blueprint name is required.');
  const blueprint = {
    schemaVersion: 1,
    name,
    sourceFile: String(options.sourceFile || '').slice(0, 260),
    sourceFormat: parsed.format,
    edition,
    version: parsed.version,
    detectedVersion: parsed.detectedVersion,
    dimensions: { x: parsed.dimensions.x, y: parsed.dimensions.y, z: parsed.dimensions.z },
    volume: parsed.dimensions.volume,
    offset: parsed.offset,
    palette: parsed.palette,
    blocks: parsed.blocks,
    blockEntities: parsed.blockEntities,
    materials: materialBill(parsed.palette, parsed.blocks),
    unsupportedBlocks: parsed.palette.filter((entry) => !entry.air && !entry.supported).map((entry) => entry.state),
    supportSensitiveBlocks: parsed.palette.filter((entry) => entry.needsSupport).map((entry) => entry.state),
    importedAt: Date.now()
  };
  blueprint.hash = blueprintHash(blueprint);
  blueprint.id = blueprint.hash.slice(0, 16);
  return blueprint;
}

module.exports = {
  MAX_BLUEPRINT_DECOMPRESSED_BYTES,
  MAX_BLUEPRINT_FILE_BYTES,
  boundedBlockEntities,
  byteValues,
  decodeNbt,
  decodeVarints,
  importedBlueprint,
  legacyState,
  minecraftVersionForDataVersion,
  normalizePalette,
  paletteEntry,
  parseMcedit,
  parseSponge
};
