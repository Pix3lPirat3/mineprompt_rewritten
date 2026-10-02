'use strict';

const FACE_DETERMINED_WALL_BLOCKS = /(?:wall_torch|ladder|button|lever|tripwire_hook|wall_sign|wall_hanging_sign|wall_banner)$/u;
const EXECUTABLE_PLACEMENT_MODES = new Set(['simple', 'gravity', 'scaffold', 'axis', 'slab', 'face-attached', 'wall-attached', 'directional', 'multiblock', 'paired-container']);
const TOWARD_YAW = Object.freeze({ south: 0, east: Math.PI / 2, north: Math.PI, west: -Math.PI / 2 });
const AWAY_YAW = Object.freeze({ north: 0, west: Math.PI / 2, south: Math.PI, east: -Math.PI / 2 });

function falseState(value) {
  return value === undefined || value === 'false';
}

function onlyProperties(properties, names) {
  return Object.keys(properties).every((name) => names.includes(name));
}

function faceAttached(parsed, supportKind) {
  const properties = parsed.properties;
  if (/(?:_button|^lever)$/u.test(parsed.name)) {
    return properties.face === supportKind && Object.hasOwn(AWAY_YAW, properties.facing) && falseState(properties.powered) && onlyProperties(properties, ['face', 'facing', 'powered']);
  }
  if (['lantern', 'soul_lantern'].includes(parsed.name)) {
    const hanging = properties.hanging === 'true';
    return onlyProperties(properties, ['hanging', 'waterlogged']) && falseState(properties.waterlogged) && (supportKind === 'ceiling' ? hanging : !hanging);
  }
  if (supportKind !== 'floor') return false;
  if (['torch', 'soul_torch'].includes(parsed.name)) return onlyProperties(properties, []);
  if (parsed.name.endsWith('_pressure_plate')) return onlyProperties(properties, ['powered']) && falseState(properties.powered);
  if (parsed.name.endsWith('_carpet')) return onlyProperties(properties, []);
  return false;
}

function attachmentLook(parsed, supportKind) {
  return faceAttached(parsed, supportKind) && /(?:_button|^lever)$/u.test(parsed.name)
    ? { yaw: AWAY_YAW[parsed.properties.facing], pitch: null }
    : null;
}

function directionalLook(parsed) {
  const properties = parsed.properties;
  const facing = properties.facing;
  if (!Object.hasOwn(TOWARD_YAW, facing)) return null;
  if (['furnace', 'blast_furnace', 'smoker'].includes(parsed.name) && falseState(properties.lit)) return { yaw: TOWARD_YAW[facing], pitch: 0 };
  if (['chest', 'trapped_chest'].includes(parsed.name) && properties.type === 'single' && falseState(properties.waterlogged)) return { yaw: TOWARD_YAW[facing], pitch: 0 };
  if (['piston', 'sticky_piston'].includes(parsed.name) && falseState(properties.extended)) return { yaw: TOWARD_YAW[facing], pitch: 0 };
  if (parsed.name === 'observer' && falseState(properties.powered)) return { yaw: AWAY_YAW[facing], pitch: 0 };
  if (parsed.name.endsWith('_stairs') && properties.shape === 'straight' && falseState(properties.waterlogged)) return { yaw: AWAY_YAW[facing], pitch: 0 };
  return null;
}

function multiblockLook(parsed) {
  const properties = parsed.properties;
  const facing = properties.facing;
  if (!Object.hasOwn(AWAY_YAW, facing)) return null;
  if (parsed.name.endsWith('_door') && ['lower', 'upper'].includes(properties.half) && ['left', 'right'].includes(properties.hinge) && falseState(properties.open) && falseState(properties.powered)) return { yaw: AWAY_YAW[facing], pitch: 0 };
  if (parsed.name.endsWith('_bed') && ['foot', 'head'].includes(properties.part) && falseState(properties.occupied)) return { yaw: AWAY_YAW[facing], pitch: 0 };
  return null;
}

function pairedContainerLook(parsed) {
  const properties = parsed.properties;
  if (!['chest', 'trapped_chest'].includes(parsed.name) || !['left', 'right'].includes(properties.type) || properties.waterlogged === 'true') return null;
  return Object.hasOwn(TOWARD_YAW, properties.facing) ? { yaw: TOWARD_YAW[properties.facing], pitch: 0 } : null;
}

function placementMode(parsed, supportKind, groupId) {
  if (groupId?.startsWith('container:')) return pairedContainerLook(parsed) ? 'paired-container' : 'container-unsupported';
  if (groupId) return multiblockLook(parsed) ? 'multiblock' : 'multiblock-unsupported';
  if (supportKind === 'wall') return parsed.properties.facing && FACE_DETERMINED_WALL_BLOCKS.test(parsed.name) ? 'wall-attached' : 'attached';
  if (supportKind === 'ceiling' || supportKind === 'floor') return faceAttached(parsed, supportKind) ? 'face-attached' : 'attached';
  if (supportKind === 'gravity' || supportKind === 'scaffold' || supportKind === 'axis' || supportKind === 'slab') return supportKind;
  if (supportKind === 'stairs') return directionalLook(parsed) ? 'directional' : 'directional-unsupported';
  if (parsed.properties.facing) return directionalLook(parsed) ? 'directional' : 'directional-unsupported';
  return 'simple';
}

function executablePlacementMode(mode) {
  return EXECUTABLE_PLACEMENT_MODES.has(mode);
}

module.exports = {
  EXECUTABLE_PLACEMENT_MODES,
  attachmentLook,
  directionalLook,
  executablePlacementMode,
  faceAttached,
  multiblockLook,
  pairedContainerLook,
  placementMode
};
