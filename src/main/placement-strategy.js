'use strict';

const FACE_DETERMINED_WALL_BLOCKS = /(?:wall_torch|ladder|button|lever|tripwire_hook|wall_sign|wall_hanging_sign|wall_banner)$/u;
const EXECUTABLE_PLACEMENT_MODES = new Set(['simple', 'gravity', 'scaffold', 'axis', 'slab', 'wall-attached']);

function placementMode(parsed, supportKind, groupId) {
  if (groupId && !groupId.startsWith('container:')) return 'multiblock';
  if (supportKind === 'wall') return parsed.properties.facing && FACE_DETERMINED_WALL_BLOCKS.test(parsed.name) ? 'wall-attached' : 'attached';
  if (supportKind === 'ceiling' || supportKind === 'floor') return 'attached';
  if (supportKind === 'gravity' || supportKind === 'scaffold' || supportKind === 'axis' || supportKind === 'slab') return supportKind;
  if (parsed.properties.facing) return 'directional';
  return 'simple';
}

function executablePlacementMode(mode) {
  return EXECUTABLE_PLACEMENT_MODES.has(mode);
}

module.exports = {
  EXECUTABLE_PLACEMENT_MODES,
  executablePlacementMode,
  placementMode
};
