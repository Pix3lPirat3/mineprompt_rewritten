'use strict';

const { Vec3 } = require('vec3');
const { isAirState, parseBlockState } = require('./blueprint-model');
const { directionalLook, multiblockLook, placementMode } = require('./placement-strategy');
const { PriorityQueue } = require('./priority-queue');

const MAX_PLACEMENT_OPERATIONS = 1048576;
const MAX_STANCE_OPERATIONS = 4096;
const MAX_STANCES = 4096;
const PLAN_SAMPLE_LIMIT = 128;
const MAX_SCAFFOLD_HEIGHT = 64;
const MAX_SCAFFOLD_BLOCKS = 8192;
const PASSABLE_BLOCKS = new Set(['air', 'cave_air', 'void_air', 'grass', 'short_grass', 'tall_grass', 'fern', 'large_fern', 'dead_bush', 'snow', 'vine']);
const HAZARD_BLOCKS = new Set(['lava', 'fire', 'soul_fire', 'cactus', 'magma_block', 'campfire', 'soul_campfire', 'sweet_berry_bush', 'powder_snow']);
const GRAVITY_BLOCKS = /(?:sand|gravel|concrete_powder|anvil|dragon_egg|scaffolding)$/u;
const FLOOR_ATTACHED_BLOCKS = /(?:rail|carpet|pressure_plate|repeater|comparator|tripwire|redstone_wire|sapling|flower|mushroom|wheat|potatoes|carrots|beetroots|sugar_cane|cactus|bamboo|kelp|torch|lantern|candle)$/u;
const WALL_ATTACHED_BLOCKS = /(?:wall_|ladder|vine|cocoa|button|lever|tripwire_hook)$/u;

const DIRECTIONS = Object.freeze({
  down: { x: 0, y: -1, z: 0 },
  up: { x: 0, y: 1, z: 0 },
  north: { x: 0, y: 0, z: -1 },
  south: { x: 0, y: 0, z: 1 },
  west: { x: -1, y: 0, z: 0 },
  east: { x: 1, y: 0, z: 0 }
});

function positionKey(position) {
  return `${position.x},${position.y},${position.z}`;
}

function offsetPosition(position, offset) {
  return { x: position.x + offset.x, y: position.y + offset.y, z: position.z + offset.z };
}

function subtractPosition(left, right) {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}

function positionDistance(left, right) {
  const dx = left.x - right.x;
  const dy = left.y - right.y;
  const dz = left.z - right.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function opposite(direction) {
  return { x: direction.x ? -direction.x : 0, y: direction.y ? -direction.y : 0, z: direction.z ? -direction.z : 0 };
}

function supportRule(entry) {
  const parsed = parseBlockState(entry.state);
  const properties = parsed.properties;
  if (properties.face === 'ceiling' || properties.hanging === 'true' || properties.attachment === 'ceiling') return { kind: 'ceiling', offsets: [DIRECTIONS.up], required: true };
  if (properties.face === 'wall' && DIRECTIONS[properties.facing]) return { kind: 'wall', offsets: [opposite(DIRECTIONS[properties.facing])], required: true };
  if ((WALL_ATTACHED_BLOCKS.test(parsed.name) || parsed.name.endsWith('_wall_sign') || parsed.name.endsWith('_wall_banner')) && DIRECTIONS[properties.facing]) return { kind: 'wall', offsets: [opposite(DIRECTIONS[properties.facing])], required: true };
  if (properties.half === 'upper' && /(?:door|tall_|large_fern|sunflower|rose_bush|peony|lilac|pitcher_plant)$/u.test(parsed.name)) return { kind: 'multiblock', offsets: [DIRECTIONS.down], required: true };
  if (properties.part === 'head' && DIRECTIONS[properties.facing]) return { kind: 'multiblock', offsets: [opposite(DIRECTIONS[properties.facing])], required: true };
  if (properties.axis === 'x') return { kind: 'axis', offsets: [DIRECTIONS.west, DIRECTIONS.east], required: true };
  if (properties.axis === 'z') return { kind: 'axis', offsets: [DIRECTIONS.north, DIRECTIONS.south], required: true };
  if (properties.axis === 'y') return { kind: 'axis', offsets: [DIRECTIONS.down, DIRECTIONS.up], required: true };
  if (parsed.name.endsWith('_stairs') && properties.half === 'top') return { kind: 'stairs', offsets: [DIRECTIONS.north, DIRECTIONS.south, DIRECTIONS.west, DIRECTIONS.east, DIRECTIONS.up], required: true };
  if (parsed.name.endsWith('_stairs')) return { kind: 'stairs', offsets: [DIRECTIONS.down, DIRECTIONS.north, DIRECTIONS.south, DIRECTIONS.west, DIRECTIONS.east], required: true };
  if (parsed.name.endsWith('_slab') && properties.type === 'top') return { kind: 'slab', offsets: [DIRECTIONS.north, DIRECTIONS.south, DIRECTIONS.west, DIRECTIONS.east, DIRECTIONS.up], required: true };
  if (parsed.name.endsWith('_slab')) return { kind: 'slab', offsets: [DIRECTIONS.down, DIRECTIONS.north, DIRECTIONS.south, DIRECTIONS.west, DIRECTIONS.east], required: true };
  if (GRAVITY_BLOCKS.test(parsed.name)) return { kind: 'gravity', offsets: [DIRECTIONS.down], required: true };
  if (properties.face === 'floor' || FLOOR_ATTACHED_BLOCKS.test(parsed.name)) return { kind: 'floor', offsets: [DIRECTIONS.down], required: true };
  const vineOffsets = Object.entries(DIRECTIONS).filter(([name]) => ['north', 'south', 'east', 'west'].includes(name) && properties[name] === 'true').map(([, direction]) => direction);
  if (vineOffsets.length) return { kind: 'wall', offsets: vineOffsets.map(opposite), required: true };
  return { kind: 'reference', offsets: [DIRECTIONS.down, DIRECTIONS.north, DIRECTIONS.south, DIRECTIONS.west, DIRECTIONS.east, DIRECTIONS.up], required: false };
}

function groupId(record) {
  const parsed = parseBlockState(record.entry.state);
  if (/(?:door|tall_|large_fern|sunflower|rose_bush|peony|lilac|pitcher_plant)$/u.test(parsed.name) && ['lower', 'upper'].includes(parsed.properties.half)) {
    const base = parsed.properties.half === 'upper' ? offsetPosition(record.position, DIRECTIONS.down) : record.position;
    return `vertical:${positionKey(base)}`;
  }
  if (parsed.properties.part && DIRECTIONS[parsed.properties.facing]) {
    const foot = parsed.properties.part === 'head' ? offsetPosition(record.position, opposite(DIRECTIONS[parsed.properties.facing])) : record.position;
    return `horizontal:${positionKey(foot)}`;
  }
  if (['chest', 'trapped_chest'].includes(parsed.name) && ['left', 'right'].includes(parsed.properties.type) && DIRECTIONS[parsed.properties.facing]) {
    const facing = DIRECTIONS[parsed.properties.facing];
    const right = { x: -facing.z, y: 0, z: facing.x };
    const partner = offsetPosition(record.position, parsed.properties.type === 'left' ? right : opposite(right));
    const base = [record.position, partner].sort((left, rightPosition) => left.x - rightPosition.x || left.y - rightPosition.y || left.z - rightPosition.z)[0];
    return `container:${positionKey(base)}`;
  }
  return null;
}

function operationPriority(operation) {
  if (operation.kind === 'remove') return 0;
  if (operation.kind === 'scaffold-place') return 1;
  if (operation.kind === 'place') return 2;
  return 3;
}

function compareOperations(left, right) {
  return operationPriority(left) - operationPriority(right) || left.position.y - right.position.y || left.position.x - right.position.x || left.position.z - right.position.z || left.id.localeCompare(right.id);
}

function worldBlock(bot, position) {
  try { return bot?.blockAt?.(new Vec3(position.x, position.y, position.z)) || null; } catch { return null; }
}

function isExistingSupport(bot, analysisByPosition, position) {
  const record = analysisByPosition.get(positionKey(position));
  if (record) {
    if (record.kind === 'replaceable' && isAirState(record.entry.state)) return false;
    if (record.kind === 'correct') return !isAirState(record.entry.state);
    if (record.kind === 'placeable' || record.kind === 'replaceable') return false;
    return record.blockName && !PASSABLE_BLOCKS.has(record.blockName);
  }
  const block = worldBlock(bot, position);
  return Boolean(block?.name && !PASSABLE_BLOCKS.has(block.name) && !['water', 'lava'].includes(block.name));
}

function placementInstruction(operation, support, rule) {
  const parsed = parseBlockState(operation.expected);
  const face = support ? subtractPosition(operation.position, support) : null;
  const facing = DIRECTIONS[parsed.properties.facing] || null;
  const cursor = { x: 0.5, y: 0.5, z: 0.5 };
  if (face) {
    if (face.x) cursor.x = face.x > 0 ? 1 : 0;
    if (face.y) cursor.y = face.y > 0 ? 1 : 0;
    if (face.z) cursor.z = face.z > 0 ? 1 : 0;
  }
  if (parsed.properties.half === 'top' || parsed.properties.type === 'top') cursor.y = 0.75;
  if (parsed.properties.half === 'bottom' || parsed.properties.type === 'bottom') cursor.y = 0.25;
  if (parsed.name.endsWith('_door') && ['left', 'right'].includes(parsed.properties.hinge) && facing) {
    const right = { x: -facing.z, z: facing.x };
    const amount = parsed.properties.hinge === 'right' ? 0.8 : 0.2;
    if (right.x) cursor.x = right.x > 0 ? amount : 1 - amount;
    if (right.z) cursor.z = right.z > 0 ? amount : 1 - amount;
  }
  const mode = placementMode(parsed, rule.kind, operation.groupId);
  return {
    supportPosition: support ? { ...support } : null,
    clickedFace: face,
    cursor,
    facing: facing ? { ...facing } : null,
    look: directionalLook(parsed) || multiblockLook(parsed),
    rotation: parsed.properties.rotation === undefined ? null : Number(parsed.properties.rotation),
    sneak: false,
    supportKind: rule.kind,
    mode,
    stateProperties: { ...parsed.properties },
    special: mode !== 'simple'
  };
}

function groupOrder(operation) {
  const properties = parseBlockState(operation.expected).properties;
  if (properties.half === 'lower' || properties.part === 'foot') return 0;
  if (properties.half === 'upper' || properties.part === 'head') return 1;
  return 2;
}

function comparableState(operation, omitted) {
  const parsed = parseBlockState(operation.expected);
  return JSON.stringify({
    name: parsed.name,
    properties: Object.fromEntries(Object.entries(parsed.properties).filter(([key]) => key !== omitted).sort(([left], [right]) => left.localeCompare(right)))
  });
}

function validateGeneratedGroup(group) {
  if (group.length !== 2) return false;
  const first = parseBlockState(group[0].expected);
  if (group[0].groupId.startsWith('vertical:')) {
    const lower = group.find((operation) => parseBlockState(operation.expected).properties.half === 'lower');
    const upper = group.find((operation) => parseBlockState(operation.expected).properties.half === 'upper');
    return Boolean(first.name.endsWith('_door') && lower && upper && comparableState(lower, 'half') === comparableState(upper, 'half') && upper.position.x === lower.position.x && upper.position.y === lower.position.y + 1 && upper.position.z === lower.position.z);
  }
  if (group[0].groupId.startsWith('horizontal:')) {
    const foot = group.find((operation) => parseBlockState(operation.expected).properties.part === 'foot');
    const head = group.find((operation) => parseBlockState(operation.expected).properties.part === 'head');
    if (!first.name.endsWith('_bed') || !foot || !head || comparableState(foot, 'part') !== comparableState(head, 'part')) return false;
    const facing = DIRECTIONS[parseBlockState(foot.expected).properties.facing];
    return Boolean(facing && head.position.x === foot.position.x + facing.x && head.position.y === foot.position.y && head.position.z === foot.position.z + facing.z);
  }
  return true;
}

function topologicalOrder(operations) {
  const byId = new Map(operations.map((operation) => [operation.id, operation]));
  const indegree = new Map(operations.map((operation) => [operation.id, 0]));
  const dependents = new Map(operations.map((operation) => [operation.id, []]));
  for (const operation of operations) {
    for (const dependency of operation.dependencies) {
      if (!byId.has(dependency)) continue;
      indegree.set(operation.id, indegree.get(operation.id) + 1);
      dependents.get(dependency).push(operation.id);
    }
  }
  const ready = new PriorityQueue(compareOperations);
  for (const operation of operations) {
    if (indegree.get(operation.id) === 0) ready.push(operation);
  }
  const ordered = [];
  while (ready.size) {
    const operation = ready.shift();
    ordered.push(operation.id);
    for (const id of dependents.get(operation.id)) {
      indegree.set(id, indegree.get(id) - 1);
      if (indegree.get(id) === 0) {
        ready.push(byId.get(id));
      }
    }
  }
  const orderedIds = new Set(ordered);
  const cyclic = operations.filter((operation) => !orderedIds.has(operation.id)).map((operation) => operation.id).sort();
  return { ordered, cyclic };
}

function compilePlacementGraph(bot, analysis) {
  if (!Array.isArray(analysis?.records)) throw new Error('A collected world analysis is required for placement compilation.');
  const actionable = analysis.records.filter((record) => record.kind === 'placeable' || record.kind === 'replaceable');
  const estimatedOperations = actionable.reduce((sum, record) => sum + (record.kind === 'replaceable' ? 1 : 0) + (!isAirState(record.entry.state) ? 1 : 0), 0);
  if (estimatedOperations > MAX_PLACEMENT_OPERATIONS) throw new Error(`Placement plans cannot exceed ${MAX_PLACEMENT_OPERATIONS} operations.`);
  const operations = [];
  const placements = new Map();
  const analysisByPosition = new Map(analysis.records.map((record) => [positionKey(record.position), record]));
  const blockEntityPositions = new Set((analysis.transformed?.blockEntities || []).flatMap((entity) => {
    const local = Array.isArray(entity?.Pos) ? entity.Pos : Array.isArray(entity?.pos) ? entity.pos : null;
    if (!local) return [];
    return [positionKey({ x: analysis.anchor.x + analysis.transformed.offset.x + Number(local[0]), y: analysis.anchor.y + analysis.transformed.offset.y + Number(local[1]), z: analysis.anchor.z + analysis.transformed.offset.z + Number(local[2]) })];
  }));
  for (const record of actionable) {
    let removal = null;
    if (record.kind === 'replaceable' || record.temporaryScaffold) {
      removal = {
        id: `${record.temporaryScaffold ? 'scaffold-remove' : 'remove'}:${positionKey(record.position)}`,
        kind: record.temporaryScaffold ? 'scaffold-remove' : 'remove',
        position: { ...record.position },
        current: record.current,
        expected: record.entry.state,
        dependencies: [],
        groupId: null,
        blocked: []
      };
      operations.push(removal);
    }
    if (isAirState(record.entry.state)) continue;
    const operation = {
      id: `place:${positionKey(record.position)}`,
      kind: 'place',
      position: { ...record.position },
      current: record.current,
      expected: record.entry.state,
      item: record.entry.item,
      paletteIndex: record.paletteIndex,
      dependencies: removal ? [removal.id] : [],
      groupId: groupId(record),
      blocked: [],
      instruction: null,
      requiresScaffold: false,
      requiresBlockEntityData: blockEntityPositions.has(positionKey(record.position))
    };
    const properties = parseBlockState(record.entry.state).properties;
    if (properties.waterlogged === 'true') operation.blocked.push({ code: 'waterlogged-unsupported', message: 'Waterlogged placement requires an explicit fluid strategy.' });
    if (record.entry.name.endsWith('_slab') && properties.type === 'double') operation.blocked.push({ code: 'double-slab-unsupported', message: 'Double slabs require two verified placement actions.' });
    if (operation.requiresBlockEntityData) operation.blocked.push({ code: 'block-entity-unsupported', message: 'Block entity data application is not implemented.' });
    operations.push(operation);
    placements.set(positionKey(operation.position), operation);
  }
  for (const operation of placements.values()) {
    const record = analysisByPosition.get(positionKey(operation.position));
    const rule = supportRule(record.entry);
    let support = null;
    for (const offset of rule.offsets) {
      const candidate = offsetPosition(operation.position, offset);
      const planned = placements.get(positionKey(candidate));
      if (planned && (rule.required || compareOperations(planned, operation) < 0)) {
        support = candidate;
        operation.dependencies.push(planned.id);
        break;
      }
      if (isExistingSupport(bot, analysisByPosition, candidate)) {
        support = candidate;
        break;
      }
    }
    if (!support) {
      operation.requiresScaffold = true;
      if (rule.required) operation.blocked.push({ code: 'missing-support', message: `No valid ${rule.kind} support is available.` });
    }
    operation.dependencies = [...new Set(operation.dependencies)].sort();
    operation.instruction = placementInstruction(operation, support, rule);
  }
  const groups = new Map();
  for (const operation of placements.values()) {
    if (!operation.groupId) continue;
    const group = groups.get(operation.groupId) || [];
    group.push(operation);
    groups.set(operation.groupId, group);
  }
  for (const group of groups.values()) {
    const ordered = group.sort((left, right) => groupOrder(left) - groupOrder(right) || compareOperations(left, right));
    if (!ordered[0].groupId.startsWith('container:')) {
      if (!validateGeneratedGroup(ordered)) {
        for (const operation of ordered) operation.blocked.push({ code: 'invalid-multiblock', message: 'The generated multi-block structure is incomplete or inconsistent.' });
      } else {
        const companions = ordered.map((operation) => ({ position: { ...operation.position }, expected: operation.expected }));
        for (const operation of ordered) operation.companions = companions;
      }
    }
    for (let index = 1; index < ordered.length; index += 1) {
      ordered[index].dependencies = [...new Set([...ordered[index].dependencies, ordered[index - 1].id])].sort();
    }
  }
  const scaffoldMaterial = String(analysis.policy?.scaffolding?.[0] || '').trim().toLowerCase();
  const scaffoldUsers = new Map();
  const scaffoldPlacements = new Map();
  const finalSolid = new Set(analysis.records.filter((record) => !isAirState(record.entry.state)).map((record) => positionKey(record.position)));
  const scaffoldMaterialAvailable = scaffoldMaterial && (!bot.registry || Boolean(bot.registry.blocksByName?.[scaffoldMaterial] && bot.registry.itemsByName?.[scaffoldMaterial]));
  const ensureScaffoldColumn = (target) => {
    const column = [];
    let position = { ...target };
    for (let depth = 0; depth < MAX_SCAFFOLD_HEIGHT; depth += 1) {
      if (isExistingSupport(bot, analysisByPosition, position) || scaffoldPlacements.has(positionKey(position))) break;
      const key = positionKey(position);
      const record = analysisByPosition.get(key);
      if (finalSolid.has(key) || record && !['placeable', 'replaceable', 'ignoredAir'].includes(record.kind)) return null;
      const live = worldBlock(bot, position);
      if (!record && (!live?.name || !PASSABLE_BLOCKS.has(live.name))) return null;
      column.push({ ...position });
      position = offsetPosition(position, DIRECTIONS.down);
    }
    if (!isExistingSupport(bot, analysisByPosition, position) && !scaffoldPlacements.has(positionKey(position))) return null;
    let dependency = scaffoldPlacements.get(positionKey(position))?.id || null;
    for (const cell of column.reverse()) {
      const key = positionKey(cell);
      let scaffold = scaffoldPlacements.get(key);
      if (!scaffold) {
        const record = analysisByPosition.get(key);
        const removalDependency = record?.kind === 'replaceable' ? `remove:${key}` : null;
        scaffold = {
          id: `scaffold-place:${key}`,
          kind: 'scaffold-place',
          position: { ...cell },
          current: record?.current || 'minecraft:air',
          expected: `minecraft:${scaffoldMaterial}`,
          item: scaffoldMaterial,
          dependencies: [...(dependency ? [dependency] : []), ...(removalDependency ? [removalDependency] : [])].sort(),
          groupId: `scaffold:${positionKey(target)}`,
          blocked: [],
          requiresScaffold: false,
          instruction: placementInstruction({ position: cell, expected: `minecraft:${scaffoldMaterial}`, groupId: null }, dependency ? offsetPosition(cell, DIRECTIONS.down) : position, { kind: 'scaffold' })
        };
        scaffoldPlacements.set(key, scaffold);
        operations.push(scaffold);
      }
      dependency = scaffold.id;
    }
    return dependency;
  };
  for (const operation of placements.values()) {
    if (!operation.requiresScaffold || operation.blocked.length) continue;
    if (!scaffoldMaterialAvailable) {
      operation.blocked.push({ code: 'scaffold-unavailable', message: 'No supported scaffold material is configured.' });
      continue;
    }
    const supportPosition = offsetPosition(operation.position, DIRECTIONS.down);
    const scaffoldId = ensureScaffoldColumn(supportPosition);
    if (!scaffoldId) {
      operation.blocked.push({ code: 'scaffold-path-missing', message: `No scaffold column can reach within ${MAX_SCAFFOLD_HEIGHT} blocks.` });
      continue;
    }
    operation.dependencies.push(scaffoldId);
    operation.dependencies.sort();
    operation.instruction = placementInstruction(operation, supportPosition, { kind: 'scaffold' });
    const users = scaffoldUsers.get(scaffoldId) || new Set();
    users.add(operation.id);
    scaffoldUsers.set(scaffoldId, users);
  }
  if (scaffoldPlacements.size > MAX_SCAFFOLD_BLOCKS) throw new Error(`Placement plans cannot use more than ${MAX_SCAFFOLD_BLOCKS} scaffold blocks.`);
  const scaffoldRemovals = new Map();
  for (const scaffold of [...scaffoldPlacements.values()].sort((left, right) => right.position.y - left.position.y || left.id.localeCompare(right.id))) {
    const key = positionKey(scaffold.position);
    const above = scaffoldRemovals.get(positionKey(offsetPosition(scaffold.position, DIRECTIONS.up)));
    const directUsers = scaffoldUsers.get(scaffold.id) || new Set();
    const removal = {
      id: `scaffold-remove:${key}`,
      kind: 'scaffold-remove',
      position: { ...scaffold.position },
      current: scaffold.expected,
      expected: 'minecraft:air',
      item: null,
      dependencies: [...directUsers, ...(above ? [above.id] : [])].sort(),
      groupId: scaffold.groupId,
      blocked: [],
      requiresScaffold: false,
      instruction: null
    };
    scaffoldRemovals.set(key, removal);
    operations.push(removal);
    const belowPlacement = scaffoldPlacements.get(positionKey(offsetPosition(scaffold.position, DIRECTIONS.down)));
    if (belowPlacement) {
      const belowUsers = scaffoldUsers.get(belowPlacement.id) || new Set();
      for (const user of directUsers) belowUsers.add(user);
      scaffoldUsers.set(belowPlacement.id, belowUsers);
    }
  }
  if (operations.length > MAX_PLACEMENT_OPERATIONS) throw new Error(`Placement plans cannot exceed ${MAX_PLACEMENT_OPERATIONS} operations.`);
  const topology = topologicalOrder(operations);
  const operationById = new Map(operations.map((operation) => [operation.id, operation]));
  for (const id of topology.cyclic) {
    const operation = operationById.get(id);
    operation.blocked.push({ code: 'dependency-cycle', message: 'The operation belongs to a placement dependency cycle.' });
  }
  return {
    operations: operations.sort(compareOperations),
    order: topology.ordered,
    cyclic: topology.cyclic,
    counts: {
      operations: operations.length,
      removals: operations.filter((operation) => operation.kind === 'remove').length,
      placements: placements.size,
      blocked: operations.filter((operation) => operation.blocked.length).length,
      scaffolded: operations.filter((operation) => operation.requiresScaffold).length,
      scaffoldBlocks: scaffoldPlacements.size,
      groups: groups.size
    }
  };
}

function stanceBlockName(bot, position) {
  return worldBlock(bot, position)?.name || null;
}

function stanceCellClear(bot, position) {
  const name = stanceBlockName(bot, position);
  return Boolean(name && PASSABLE_BLOCKS.has(name));
}

function safeFooting(bot, position) {
  const name = stanceBlockName(bot, offsetPosition(position, DIRECTIONS.down));
  return Boolean(name && !PASSABLE_BLOCKS.has(name) && !HAZARD_BLOCKS.has(name) && !['water', 'lava'].includes(name));
}

function basicStanceSafe(bot, position) {
  return stanceCellClear(bot, position) && stanceCellClear(bot, offsetPosition(position, DIRECTIONS.up)) && safeFooting(bot, position);
}

function hasEscape(bot, position) {
  return [DIRECTIONS.north, DIRECTIONS.south, DIRECTIONS.west, DIRECTIONS.east].some((direction) => basicStanceSafe(bot, offsetPosition(position, direction)));
}

function lineOfSight(bot, stance, target) {
  const start = { x: stance.x + 0.5, y: stance.y + 1.62, z: stance.z + 0.5 };
  const end = { x: target.x + 0.5, y: target.y + 0.5, z: target.z + 0.5 };
  const length = positionDistance(start, end);
  const steps = Math.max(1, Math.ceil(length * 5));
  const startKey = positionKey(stance);
  const targetKey = positionKey(target);
  for (let index = 1; index < steps; index += 1) {
    const ratio = index / steps;
    const position = { x: Math.floor(start.x + (end.x - start.x) * ratio), y: Math.floor(start.y + (end.y - start.y) * ratio), z: Math.floor(start.z + (end.z - start.z) * ratio) };
    const key = positionKey(position);
    if (key === startKey || key === targetKey) continue;
    const name = stanceBlockName(bot, position);
    if (!name || !PASSABLE_BLOCKS.has(name)) return false;
  }
  return true;
}

function candidateStances(bot, operation, options = {}) {
  const reach = Math.max(1, Math.min(6, Number(options.reach) || 4.5));
  const candidates = [];
  for (let y = operation.position.y - 1; y <= operation.position.y + 1; y += 1) {
    for (let x = operation.position.x - 4; x <= operation.position.x + 4; x += 1) {
      for (let z = operation.position.z - 4; z <= operation.position.z + 4; z += 1) {
        const position = { x, y, z };
        const stanceKey = positionKey(position);
        const headKey = positionKey(offsetPosition(position, DIRECTIONS.up));
        if (stanceKey === positionKey(operation.position) || headKey === positionKey(operation.position)) continue;
        const eye = { x: x + 0.5, y: y + 1.62, z: z + 0.5 };
        const target = { x: operation.position.x + 0.5, y: operation.position.y + 0.5, z: operation.position.z + 0.5 };
        const distance = positionDistance(eye, target);
        if (distance > reach || !basicStanceSafe(bot, position) || !hasEscape(bot, position) || !lineOfSight(bot, position, operation.position)) continue;
        candidates.push({ key: positionKey(position), position, distance });
      }
    }
  }
  return candidates.sort((left, right) => left.distance - right.distance || left.key.localeCompare(right.key)).slice(0, 64);
}

function routeCost(origin, stances) {
  let current = origin;
  let cost = 0;
  for (const stance of stances) {
    cost += positionDistance(current, stance.position);
    current = stance.position;
  }
  return cost;
}

function improveStanceRoute(origin, stances) {
  let route = [...stances];
  let best = routeCost(origin, route);
  let changed = true;
  while (changed) {
    changed = false;
    for (let first = 0; first < route.length - 1; first += 1) {
      for (let last = first + 1; last < route.length; last += 1) {
        const candidate = [...route.slice(0, first), ...route.slice(first, last + 1).reverse(), ...route.slice(last + 1)];
        const cost = routeCost(origin, candidate);
        if (cost + 1e-9 >= best) continue;
        route = candidate;
        best = cost;
        changed = true;
      }
    }
  }
  return { stances: route, cost: best };
}

function compileStancePlan(bot, graph, options = {}) {
  const operationById = new Map(graph.operations.map((operation) => [operation.id, operation]));
  const orderIndex = new Map(graph.order.map((id, index) => [id, index]));
  const targets = graph.order.map((id) => operationById.get(id)).filter((operation) => operation && !operation.blocked.length);
  if (targets.length > MAX_STANCE_OPERATIONS) throw new Error(`Stance compilation cannot exceed ${MAX_STANCE_OPERATIONS} ready operations.`);
  const candidates = new Map();
  const uncovered = new Set();
  for (const operation of targets) {
    uncovered.add(operation.id);
    const available = candidateStances(bot, operation, options);
    if (!available.length) {
      operation.blocked.push({ code: 'no-safe-stance', message: 'No safe reachable interaction stance was found.' });
      continue;
    }
    for (const candidate of available) {
      const value = candidates.get(candidate.key) || { key: candidate.key, position: candidate.position, covers: new Set() };
      value.covers.add(operation.id);
      candidates.set(candidate.key, value);
    }
  }
  const selected = [];
  let current = bot.entity?.position || { x: 0, y: 0, z: 0 };
  while (uncovered.size) {
    const best = [...candidates.values()].map((candidate) => {
      const covered = [...candidate.covers].filter((id) => uncovered.has(id));
      return { candidate, covered, score: covered.length * 1000 - positionDistance(current, candidate.position) };
    }).filter((entry) => entry.covered.length).sort((left, right) => right.score - left.score || left.candidate.key.localeCompare(right.candidate.key))[0];
    if (!best) break;
    selected.push({ key: best.candidate.key, position: { ...best.candidate.position }, operations: best.covered.sort((left, right) => orderIndex.get(left) - orderIndex.get(right)) });
    for (const id of best.covered) uncovered.delete(id);
    current = best.candidate.position;
    if (selected.length > MAX_STANCES) throw new Error(`Stance plans cannot exceed ${MAX_STANCES} positions.`);
  }
  for (let index = selected.length - 1; index >= 0; index -= 1) {
    const others = selected.filter((entry, candidate) => candidate !== index);
    const coveredElsewhere = new Set(others.flatMap((entry) => entry.operations));
    if (selected[index].operations.every((id) => coveredElsewhere.has(id))) selected.splice(index, 1);
  }
  const improved = improveStanceRoute(bot.entity?.position || { x: 0, y: 0, z: 0 }, selected);
  return {
    stances: improved.stances,
    estimatedTravel: improved.cost,
    uncovered: [...uncovered].sort(),
    counts: {
      stances: improved.stances.length,
      covered: new Set(improved.stances.flatMap((stance) => stance.operations)).size,
      blocked: graph.operations.filter((operation) => operation.blocked.length).length
    }
  };
}

function publicPlacementPlan(analysis, graph, stancePlan) {
  const preview = { ...analysis };
  delete preview.transformed;
  delete preview.records;
  const operationById = new Map(graph.operations.map((operation) => [operation.id, operation]));
  const ordered = graph.order.map((id) => operationById.get(id)).filter(Boolean);
  const blocked = graph.operations.filter((operation) => operation.blocked.length);
  return {
    preview,
    graph: {
      counts: { ...graph.counts, blocked: blocked.length },
      cyclicCount: graph.cyclic.length,
      operationSamples: ordered.slice(0, PLAN_SAMPLE_LIMIT).map((operation) => ({
        id: operation.id,
        kind: operation.kind,
        position: { ...operation.position },
        expected: operation.expected,
        item: operation.item || null,
        dependencies: [...operation.dependencies],
        groupId: operation.groupId,
        requiresScaffold: operation.requiresScaffold === true,
        requiresBlockEntityData: operation.requiresBlockEntityData === true,
        instruction: operation.instruction ? structuredClone(operation.instruction) : null
      })),
      blockedSamples: blocked.slice(0, PLAN_SAMPLE_LIMIT).map((operation) => ({ id: operation.id, position: { ...operation.position }, reasons: operation.blocked.map((entry) => ({ ...entry })) }))
    },
    stances: {
      counts: { ...stancePlan.counts },
      estimatedTravel: stancePlan.estimatedTravel,
      uncoveredCount: stancePlan.uncovered.length,
      uncoveredSamples: stancePlan.uncovered.slice(0, PLAN_SAMPLE_LIMIT),
      samples: stancePlan.stances.slice(0, PLAN_SAMPLE_LIMIT).map((stance) => ({ position: { ...stance.position }, operationCount: stance.operations.length }))
    }
  };
}

module.exports = {
  HAZARD_BLOCKS,
  MAX_PLACEMENT_OPERATIONS,
  MAX_STANCES,
  MAX_STANCE_OPERATIONS,
  PLAN_SAMPLE_LIMIT,
  PASSABLE_BLOCKS,
  basicStanceSafe,
  candidateStances,
  compilePlacementGraph,
  compileStancePlan,
  groupId,
  hasEscape,
  improveStanceRoute,
  lineOfSight,
  placementInstruction,
  positionDistance,
  positionKey,
  publicPlacementPlan,
  routeCost,
  supportRule,
  topologicalOrder
};
