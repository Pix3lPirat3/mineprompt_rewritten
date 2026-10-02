'use strict';

const { Vec3 } = require('vec3');
const { blockStateString, isAirState, parseBlockState } = require('./blueprint-model');
const { directionalLook, multiblockLook, pairedContainerLook, placementMode } = require('./placement-strategy');
const { PriorityQueue } = require('./priority-queue');

const MAX_PLACEMENT_OPERATIONS = 1048576;
const MAX_STANCE_OPERATIONS = 4096;
const MAX_STANCES = 4096;
const PLAN_SAMPLE_LIMIT = 128;
const MAX_SCAFFOLD_HEIGHT = 64;
const MAX_SCAFFOLD_BLOCKS = 4096;
const MAX_GROUND_SCAFFOLD_HEIGHT = 6;
const MAX_ORIENTATION_YAW_ERROR = Math.PI / 9;
const MAX_ORIENTATION_PITCH_ERROR = Math.PI / 6;
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

function isExistingSupport(bot, analysisByPosition, position, assumedAir = new Set()) {
  if (assumedAir.has(positionKey(position))) return false;
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
    look: directionalLook(parsed) || multiblockLook(parsed) || pairedContainerLook(parsed),
    rotation: parsed.properties.rotation === undefined ? null : Number(parsed.properties.rotation),
    sneak: !operation.groupId?.startsWith('container:'),
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
  if (properties.type === 'right') return 0;
  if (properties.type === 'left') return 1;
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

function validateContainerGroup(group) {
  if (group.length !== 2) return false;
  const left = group.find((operation) => parseBlockState(operation.expected).properties.type === 'left');
  const right = group.find((operation) => parseBlockState(operation.expected).properties.type === 'right');
  if (!left || !right || comparableState(left, 'type') !== comparableState(right, 'type')) return false;
  const parsed = parseBlockState(left.expected);
  const facing = DIRECTIONS[parsed.properties.facing];
  const offset = facing ? { x: -facing.z, z: facing.x } : null;
  return Boolean(['chest', 'trapped_chest'].includes(parsed.name) && offset && right.position.x === left.position.x + offset.x && right.position.y === left.position.y && right.position.z === left.position.z + offset.z);
}

function singleContainerState(operation) {
  const parsed = parseBlockState(operation.expected);
  return blockStateString({ ...parsed, properties: { ...parsed.properties, type: 'single' } });
}

function placementStep(operation, intermediateExpected = null) {
  return {
    id: operation.id,
    kind: operation.kind,
    position: { ...operation.position },
    current: operation.current,
    expected: operation.expected,
    item: operation.item,
    dependencies: [...operation.dependencies],
    instruction: structuredClone(operation.instruction),
    intermediateExpected
  };
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
    if (ordered[0].groupId.startsWith('container:')) {
      if (!validateContainerGroup(ordered)) {
        for (const operation of ordered) operation.blocked.push({ code: 'invalid-container-pair', message: 'The paired container structure is incomplete or inconsistent.' });
      } else {
        const companions = ordered.map((operation) => ({ position: { ...operation.position }, expected: operation.expected }));
        ordered[0].companions = companions;
        ordered[0].groupPlacements = ordered.map((operation, index) => placementStep(operation, index === 0 ? singleContainerState(operation) : null));
      }
    } else {
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
  const scaffoldTowers = [];
  const finalSolid = new Set(analysis.records.filter((record) => !isAirState(record.entry.state)).map((record) => positionKey(record.position)));
  const assumedAir = new Set(analysis.temporaryScaffolds || []);
  const scaffoldMaterialAvailable = scaffoldMaterial && (!bot.registry || Boolean(bot.registry.blocksByName?.[scaffoldMaterial] && bot.registry.itemsByName?.[scaffoldMaterial]));
  const traceScaffoldColumn = (target) => {
    const column = [];
    let position = { ...target };
    for (let depth = 0; depth < MAX_SCAFFOLD_HEIGHT; depth += 1) {
      if (isExistingSupport(bot, analysisByPosition, position, assumedAir) || scaffoldPlacements.has(positionKey(position))) break;
      const key = positionKey(position);
      const record = analysisByPosition.get(key);
      if (finalSolid.has(key) || record && !['placeable', 'replaceable', 'ignoredAir'].includes(record.kind)) return null;
      const live = worldBlock(bot, position);
      if (!record && !assumedAir.has(key) && (!live?.name || !PASSABLE_BLOCKS.has(live.name))) return null;
      column.push({ ...position });
      position = offsetPosition(position, DIRECTIONS.down);
    }
    if (!isExistingSupport(bot, analysisByPosition, position, assumedAir) && !scaffoldPlacements.has(positionKey(position))) return null;
    return { cells: column.reverse(), base: { ...position } };
  };
  const ensureScaffoldCell = (cell, support, dependencies, groupIdValue) => {
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
        dependencies: [...new Set([...dependencies, ...(removalDependency ? [removalDependency] : [])])].sort(),
        groupId: groupIdValue,
        blocked: [],
        requiresScaffold: false,
        instruction: placementInstruction({ position: cell, expected: `minecraft:${scaffoldMaterial}`, groupId: null }, support, { kind: 'scaffold' })
      };
      scaffoldPlacements.set(key, scaffold);
      operations.push(scaffold);
    } else {
      scaffold.dependencies = [...new Set([...scaffold.dependencies, ...dependencies])].sort();
    }
    return scaffold;
  };
  const ensureSingleScaffoldColumn = (trace, target) => {
    let dependency = scaffoldPlacements.get(positionKey(trace.base))?.id || null;
    for (const cell of trace.cells) {
      const support = offsetPosition(cell, DIRECTIONS.down);
      const scaffold = ensureScaffoldCell(cell, support, dependency ? [dependency] : [], `scaffold:${positionKey(target)}`);
      dependency = scaffold.id;
    }
    return dependency || scaffoldPlacements.get(positionKey(target))?.id || null;
  };
  const accessShapes = [DIRECTIONS.north, DIRECTIONS.south, DIRECTIONS.west, DIRECTIONS.east].flatMap((first) => {
    const turns = first.x ? [DIRECTIONS.north, DIRECTIONS.south] : [DIRECTIONS.west, DIRECTIONS.east];
    return turns.map((turn) => ({ first, turn }));
  });
  const ensureScaffoldAccess = (target) => {
    const supportTrace = traceScaffoldColumn(target);
    if (!supportTrace) return null;
    if (supportTrace.cells.length <= MAX_GROUND_SCAFFOLD_HEIGHT) {
      const id = ensureSingleScaffoldColumn(supportTrace, target);
      return id ? { ids: [id], stance: null } : null;
    }
    const candidates = [];
    for (const shape of accessShapes) {
      const firstTarget = offsetPosition(target, shape.first);
      const secondTarget = offsetPosition(firstTarget, shape.turn);
      const firstTrace = traceScaffoldColumn(firstTarget);
      const secondTrace = traceScaffoldColumn(secondTarget);
      if (!firstTrace || !secondTrace) continue;
      const levels = supportTrace.cells.map((cell) => cell.y);
      if (firstTrace.cells.length !== levels.length || secondTrace.cells.length !== levels.length) continue;
      if (!firstTrace.cells.every((cell, index) => cell.y === levels[index]) || !secondTrace.cells.every((cell, index) => cell.y === levels[index])) continue;
      candidates.push({ firstTrace, secondTrace, firstTarget, secondTarget, score: positionDistance(bot.entity?.position || target, firstTrace.cells[0]) });
    }
    const selected = candidates.sort((left, right) => left.score - right.score || positionKey(left.firstTarget).localeCompare(positionKey(right.firstTarget)) || positionKey(left.secondTarget).localeCompare(positionKey(right.secondTarget)))[0];
    if (!selected) return null;
    const groupIdValue = `scaffold-tower:${positionKey(target)}`;
    const columns = { support: [], first: [], second: [] };
    for (let index = 0; index < supportTrace.cells.length; index += 1) {
      const supportCell = supportTrace.cells[index];
      const firstCell = selected.firstTrace.cells[index];
      const secondCell = selected.secondTrace.cells[index];
      const supportBelow = offsetPosition(supportCell, DIRECTIONS.down);
      const firstBelow = offsetPosition(firstCell, DIRECTIONS.down);
      const secondBelow = offsetPosition(secondCell, DIRECTIONS.down);
      const firstDependencies = [scaffoldPlacements.get(positionKey(firstBelow))?.id, scaffoldPlacements.get(positionKey(secondBelow))?.id].filter(Boolean);
      const first = ensureScaffoldCell(firstCell, firstBelow, firstDependencies, groupIdValue);
      const secondDependencies = [scaffoldPlacements.get(positionKey(secondBelow))?.id, first.id].filter(Boolean);
      const second = ensureScaffoldCell(secondCell, secondBelow, secondDependencies, groupIdValue);
      const supportDependencies = [scaffoldPlacements.get(positionKey(supportBelow))?.id, second.id].filter(Boolean);
      const support = ensureScaffoldCell(supportCell, supportBelow, supportDependencies, groupIdValue);
      if (index > 0) {
        first.requiredStances = [{ x: secondCell.x, y: secondCell.y, z: secondCell.z }];
        second.requiredStances = [{ x: firstCell.x, y: firstCell.y + 1, z: firstCell.z }];
        support.requiredStances = [{ x: secondCell.x, y: secondCell.y + 1, z: secondCell.z }];
      }
      columns.support.push(support.position);
      columns.first.push(first.position);
      columns.second.push(second.position);
    }
    scaffoldTowers.push(columns);
    const accessTop = columns.first.at(-1);
    return {
      ids: [columns.support, columns.first, columns.second].map((column) => scaffoldPlacements.get(positionKey(column.at(-1)))?.id).filter(Boolean),
      stance: { x: accessTop.x, y: accessTop.y + 1, z: accessTop.z }
    };
  };
  for (const operation of placements.values()) {
    if (!operation.requiresScaffold || operation.blocked.length) continue;
    if (!scaffoldMaterialAvailable) {
      operation.blocked.push({ code: 'scaffold-unavailable', message: 'No supported scaffold material is configured.' });
      continue;
    }
    const supportPosition = offsetPosition(operation.position, DIRECTIONS.down);
    const scaffoldAccess = ensureScaffoldAccess(supportPosition);
    if (!scaffoldAccess?.ids.length) {
      operation.blocked.push({ code: 'scaffold-path-missing', message: `No scaffold column can reach within ${MAX_SCAFFOLD_HEIGHT} blocks.` });
      continue;
    }
    operation.dependencies.push(...scaffoldAccess.ids);
    operation.dependencies = [...new Set(operation.dependencies)];
    operation.dependencies.sort();
    operation.instruction = placementInstruction(operation, supportPosition, { kind: 'scaffold' });
    if (scaffoldAccess.stance) operation.requiredStances = [scaffoldAccess.stance];
    for (const scaffoldId of scaffoldAccess.ids) {
      const users = scaffoldUsers.get(scaffoldId) || new Set();
      users.add(operation.id);
      scaffoldUsers.set(scaffoldId, users);
    }
  }
  if (scaffoldPlacements.size > MAX_SCAFFOLD_BLOCKS) throw new Error(`Placement plans cannot use more than ${MAX_SCAFFOLD_BLOCKS} scaffold blocks.`);
  const scaffoldRemovals = new Map();
  const cleanupDependencies = new Map();
  const cleanupStances = new Map();
  for (const tower of scaffoldTowers) {
    let previous = null;
    for (let index = tower.support.length - 1; index >= 0; index -= 1) {
      for (const column of [tower.support, tower.first, tower.second]) {
        const id = `scaffold-remove:${positionKey(column[index])}`;
        if (previous) cleanupDependencies.set(id, new Set([previous]));
        previous = id;
      }
      cleanupStances.set(`scaffold-remove:${positionKey(tower.support[index])}`, [{ x: tower.first[index].x, y: tower.first[index].y + 1, z: tower.first[index].z }]);
      cleanupStances.set(`scaffold-remove:${positionKey(tower.first[index])}`, [{ x: tower.second[index].x, y: tower.second[index].y + 1, z: tower.second[index].z }]);
      cleanupStances.set(`scaffold-remove:${positionKey(tower.second[index])}`, [{ x: tower.first[index].x, y: tower.first[index].y, z: tower.first[index].z }]);
    }
  }
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
      dependencies: [...new Set([...directUsers, ...(above ? [above.id] : []), ...(cleanupDependencies.get(`scaffold-remove:${key}`) || [])])].sort(),
      groupId: scaffold.groupId,
      blocked: [],
      requiresScaffold: false,
      instruction: null,
      requiredStances: cleanupStances.get(`scaffold-remove:${key}`) || null
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
    assumedAir: [...assumedAir].sort(),
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

function stanceBlockName(bot, position, options = {}) {
  if (typeof options.blockNameAt === 'function') return options.blockNameAt(position);
  return worldBlock(bot, position)?.name || null;
}

function stanceCellClear(bot, position, options = {}) {
  const name = stanceBlockName(bot, position, options);
  return Boolean(name && PASSABLE_BLOCKS.has(name));
}

function safeFooting(bot, position, options = {}) {
  const name = stanceBlockName(bot, offsetPosition(position, DIRECTIONS.down), options);
  return Boolean(name && !PASSABLE_BLOCKS.has(name) && !HAZARD_BLOCKS.has(name) && !['water', 'lava'].includes(name));
}

function basicStanceSafe(bot, position, options = {}) {
  return stanceCellClear(bot, position, options) && stanceCellClear(bot, offsetPosition(position, DIRECTIONS.up), options) && safeFooting(bot, position, options);
}

function angularDistance(left, right) {
  return Math.abs(Math.atan2(Math.sin(left - right), Math.cos(left - right)));
}

function placementPoint(operation) {
  const instruction = operation.instruction;
  if (!instruction?.supportPosition || !instruction.cursor) return null;
  return {
    x: instruction.supportPosition.x + instruction.cursor.x,
    y: instruction.supportPosition.y + instruction.cursor.y,
    z: instruction.supportPosition.z + instruction.cursor.z
  };
}

function placementAimValid(stance, operation, reach = 4.5) {
  const point = placementPoint(operation);
  if (!point) return true;
  const eye = { x: stance.x + 0.5, y: stance.y + 1.62, z: stance.z + 0.5 };
  if (positionDistance(eye, point) > reach) return false;
  if (!operation.instruction.look) return true;
  const deltaX = point.x - eye.x;
  const deltaY = point.y - eye.y;
  const deltaZ = point.z - eye.z;
  const yaw = Math.atan2(-deltaX, -deltaZ);
  const pitch = Math.atan2(deltaY, Math.hypot(deltaX, deltaZ));
  return angularDistance(yaw, operation.instruction.look.yaw) < MAX_ORIENTATION_YAW_ERROR && Math.abs(pitch - operation.instruction.look.pitch) < MAX_ORIENTATION_PITCH_ERROR;
}

function operationPlacements(operation) {
  return Array.isArray(operation.groupPlacements) ? operation.groupPlacements : [operation];
}

function removalPoint(stance, target) {
  const deltaX = stance.x - target.x;
  const deltaZ = stance.z - target.z;
  const point = { x: target.x + 0.5, y: target.y + 0.95, z: target.z + 0.5 };
  if (Math.abs(deltaX) >= Math.abs(deltaZ) && deltaX) point.x = deltaX > 0 ? target.x + 1 : target.x;
  else if (deltaZ) point.z = deltaZ > 0 ? target.z + 1 : target.z;
  return point;
}

function operationStanceSafe(bot, position, operation, options = {}) {
  const reach = Math.max(1, Math.min(6, Number(options.reach) || 4.5));
  const removing = operation.kind === 'remove' || operation.kind === 'scaffold-remove';
  const escapeOptions = removing ? {
    ...options,
    blockNameAt: (candidate) => positionKey(candidate) === positionKey(operation.position) ? 'air' : stanceBlockName(bot, candidate, options)
  } : options;
  if (!basicStanceSafe(bot, position, options) || !hasEscape(bot, position, escapeOptions)) return false;
  const eye = { x: position.x + 0.5, y: position.y + 1.62, z: position.z + 0.5 };
  return operationPlacements(operation).every((placement) => {
    const point = removing ? removalPoint(position, placement.position) : null;
    return (!point || positionDistance(eye, point) <= reach) && placementAimValid(position, placement, reach) && lineOfSight(bot, position, placement.position, options, point);
  });
}

function hasEscape(bot, position, options = {}) {
  return [DIRECTIONS.north, DIRECTIONS.south, DIRECTIONS.west, DIRECTIONS.east].some((direction) => [-1, 0, 1].some((vertical) => basicStanceSafe(bot, offsetPosition(offsetPosition(position, direction), { x: 0, y: vertical, z: 0 }), options)));
}

function lineOfSight(bot, stance, target, options = {}, interactionPoint = null) {
  const start = { x: stance.x + 0.5, y: stance.y + 1.62, z: stance.z + 0.5 };
  const end = interactionPoint || { x: target.x + 0.5, y: target.y + 0.5, z: target.z + 0.5 };
  const length = positionDistance(start, end);
  const steps = Math.max(1, Math.ceil(length * 5));
  const startKey = positionKey(stance);
  const targetKey = positionKey(target);
  for (let index = 1; index < steps; index += 1) {
    const ratio = index / steps;
    const position = { x: Math.floor(start.x + (end.x - start.x) * ratio), y: Math.floor(start.y + (end.y - start.y) * ratio), z: Math.floor(start.z + (end.z - start.z) * ratio) };
    const key = positionKey(position);
    if (key === startKey || key === targetKey) continue;
    const name = stanceBlockName(bot, position, options);
    if (!name || !PASSABLE_BLOCKS.has(name)) return false;
  }
  return true;
}

function candidateStances(bot, operation, options = {}) {
  const reach = Math.max(1, Math.min(6, Number(options.reach) || 4.5));
  const candidates = [];
  const consider = (position) => {
    const stanceKey = positionKey(position);
    const headKey = positionKey(offsetPosition(position, DIRECTIONS.up));
    const footingKey = positionKey(offsetPosition(position, DIRECTIONS.down));
    if (stanceKey === positionKey(operation.position) || headKey === positionKey(operation.position)) return;
    if ((operation.kind === 'remove' || operation.kind === 'scaffold-remove') && footingKey === positionKey(operation.position)) return;
    const eye = { x: position.x + 0.5, y: position.y + 1.62, z: position.z + 0.5 };
    const distance = Math.max(...operationPlacements(operation).map((placement) => positionDistance(eye, placementPoint(placement) || { x: placement.position.x + 0.5, y: placement.position.y + 0.5, z: placement.position.z + 0.5 })));
    if (!operationStanceSafe(bot, position, operation, { ...options, reach })) return;
    candidates.push({ key: stanceKey, position: { ...position }, distance });
  };
  if (Array.isArray(operation.requiredStances) && operation.requiredStances.length) {
    for (const position of operation.requiredStances) consider(position);
  } else {
    for (let y = operation.position.y - 1; y <= operation.position.y + 1; y += 1) {
      for (let x = operation.position.x - 4; x <= operation.position.x + 4; x += 1) {
        for (let z = operation.position.z - 4; z <= operation.position.z + 4; z += 1) consider({ x, y, z });
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
  const simulated = new Map((graph.assumedAir || []).map((key) => [key, 'air']));
  const blockNameAt = (position) => simulated.has(positionKey(position)) ? simulated.get(positionKey(position)) : stanceBlockName(bot, position);
  for (const operation of targets) {
    uncovered.add(operation.id);
    const available = candidateStances(bot, operation, { ...options, blockNameAt });
    if (!available.length) {
      operation.blocked.push({ code: 'no-safe-stance', message: 'No safe reachable interaction stance was found.' });
    } else {
      for (const candidate of available) {
        const value = candidates.get(candidate.key) || { key: candidate.key, position: candidate.position, covers: new Set() };
        value.covers.add(operation.id);
        candidates.set(candidate.key, value);
      }
    }
    if (operation.kind === 'remove' || operation.kind === 'scaffold-remove') simulated.set(positionKey(operation.position), 'air');
    else if (Array.isArray(operation.groupPlacements)) {
      for (const placement of operation.groupPlacements) simulated.set(positionKey(placement.position), parseBlockState(placement.expected).name);
    } else simulated.set(positionKey(operation.position), parseBlockState(operation.expected).name);
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
  delete preview.temporaryScaffolds;
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
  MAX_ORIENTATION_PITCH_ERROR,
  MAX_ORIENTATION_YAW_ERROR,
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
  operationStanceSafe,
  placementAimValid,
  placementPoint,
  placementInstruction,
  positionDistance,
  positionKey,
  publicPlacementPlan,
  removalPoint,
  routeCost,
  supportRule,
  topologicalOrder
};
