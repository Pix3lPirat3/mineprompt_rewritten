'use strict';

const { GoalNear } = require('mineflayer-pathfinder').goals;
const { Vec3 } = require('vec3');
const { MiningService } = require('./mining-service');
const { plainText } = require('./text-value');
const { navigateGoal } = require('./navigation-service');
const { BLOCK_ACTIONS, ENTITY_ACTIONS } = require('./target-actions');
const { isTreeLeaf, isTreeLog, treeSpecies, leafSpecies } = require('./tree-planner');

function roundedDistance(bot, position) {
  if (!bot?.entity?.position || !position) return null;
  const value = bot.entity.position.distanceTo(position);
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
}

function entityKind(entity) {
  if (entity?.type === 'player') return 'player';
  if (entity?.name === 'item') return 'item';
  if (entity?.name === 'villager' || entity?.displayName?.toLowerCase() === 'villager') return 'villager';
  if (['ambient', 'animal', 'hostile', 'mob', 'water_creature'].includes(entity?.type)) return 'mob';
  return 'entity';
}

function droppedItem(entity) {
  try { return entity?.getDroppedItem?.() || null; } catch { return null; }
}

function entityName(entity) {
  const dropped = droppedItem(entity);
  return entity?.username || dropped?.displayName || entity?.displayName || entity?.name || `Entity ${entity?.id}`;
}

function entityMetadata(entity, bot, name) {
  const keys = bot?.registry?.entitiesByName?.[entity?.name]?.metadataKeys;
  const index = Array.isArray(keys) ? keys.indexOf(name) : -1;
  return index >= 0 ? entity?.metadata?.[index] : undefined;
}

function entityText(entity, bot) {
  const source = entity?.displayText ?? entity?.text ?? entityMetadata(entity, bot, 'text') ?? entity?.customName ?? entityMetadata(entity, bot, 'custom_name');
  return plainText(source).trim().slice(0, 2048) || null;
}

function positionValue(position) {
  if (!position) return null;
  return { x: Math.floor(position.x), y: Math.floor(position.y), z: Math.floor(position.z) };
}

function positionText(position) {
  return `${Math.floor(position.x)}, ${Math.floor(position.y)}, ${Math.floor(position.z)}`;
}

class TargetingService {
  constructor({ getClient, activities, playerActions, mining, trees, stash, logger, onChange = () => {} }) {
    this.getClient = getClient;
    this.activities = activities;
    this.playerActions = playerActions;
    this.logger = logger;
    this.onChange = onChange;
    this.mining = mining || new MiningService({ getClient, activities, logger, onChange });
    this.trees = trees || null;
    this.stash = stash;
    this.cache = null;
  }

  get bot() {
    return this.getClient()?.bot || null;
  }

  describeEntity(entity, bot = this.bot) {
    if (!entity || !bot?.entity || entity.id === bot.entity.id) return null;
    const kind = entityKind(entity);
    const player = kind === 'player' ? Object.values(bot.players || {}).find((entry) => entry.entity?.id === entity.id || entry.username === entity.username) : null;
    const friend = player ? this.playerActions?.isFriend(player, bot) === true : false;
    const dropped = kind === 'item' ? droppedItem(entity) : null;
    const text = entityText(entity, bot);
    return {
      id: entity.id,
      kind,
      name: entity.name || kind,
      displayName: entityName(entity),
      username: entity.username || null,
      distance: roundedDistance(bot, entity.position),
      position: positionValue(entity.position),
      count: Number(dropped?.count) || null,
      text,
      friend,
      actions: ENTITY_ACTIONS.flatMap((action) => {
        if (action.kinds && !action.kinds.includes(kind)) return [];
        if (action.excludes?.includes(kind)) return [];
        if (action.id === 'entity.attack' && kind === 'player' && friend) {
          return [{ ...action, enabled: false, reason: 'Friend protected. Hold Ctrl+Shift to override.', relationshipProtected: true, overrideAllowed: true }];
        }
        return [{ ...action, enabled: true, reason: '', relationshipProtected: false, overrideAllowed: false }];
      })
    };
  }

  describeBlock(block, bot = this.bot) {
    if (!block || !bot?.entity || block.name === 'air') return null;
    const tree = isTreeLog(block) || isTreeLeaf(block);
    return {
      name: block.name,
      displayName: block.displayName || block.name,
      position: positionValue(block.position),
      distance: roundedDistance(bot, block.position),
      diggable: block.diggable !== false,
      hardness: Number.isFinite(block.hardness) ? block.hardness : null,
      tree: tree ? { species: treeSpecies(block) || leafSpecies(block), part: isTreeLog(block) ? 'log' : 'leaves' } : null,
      actions: BLOCK_ACTIONS.filter((action) => !action.treesOnly || tree).map((action) => ({ ...action, enabled: action.id !== 'block.dig' || block.diggable !== false, reason: action.id === 'block.dig' && block.diggable === false ? 'This block cannot be mined.' : '' }))
    };
  }

  snapshot(maximumDistance = 32) {
    const bot = this.bot;
    if (!bot?.entity) return { cursorBlock: null, cursorEntity: null, entities: [] };
    const now = Date.now();
    if (maximumDistance === 32 && this.cache?.bot === bot && now - this.cache.timestamp < 100) return this.cache.value;
    const entities = Object.values(bot.entities || {})
      .filter((entity) => {
        const distance = roundedDistance(bot, entity.position);
        return entity.id !== bot.entity.id && distance !== null && distance <= maximumDistance;
      })
      .map((entity) => this.describeEntity(entity, bot))
      .filter(Boolean)
      .sort((left, right) => left.distance - right.distance || left.displayName.localeCompare(right.displayName))
      .slice(0, 160);
    const value = {
      cursorBlock: this.describeBlock(bot.blockAtCursor?.(32), bot),
      cursorEntity: this.describeEntity(bot.entityAtCursor?.(32), bot),
      entities
    };
    if (maximumDistance === 32) this.cache = { bot, timestamp: now, value };
    return value;
  }

  findEntity(request, bot) {
    if (request.target === 'cursor') return bot.entityAtCursor?.(32) || null;
    const id = Number(request.entityId ?? request.target);
    if (Number.isInteger(id)) return bot.entities?.[id] || Object.values(bot.entities || {}).find((entity) => entity.id === id) || null;
    const name = String(request.target || '').toLowerCase();
    return Object.values(bot.entities || {}).find((entity) => entityName(entity).toLowerCase() === name || entity.username?.toLowerCase() === name) || null;
  }

  findBlock(request, bot) {
    if (request.target === 'cursor' || !request.position) return bot.blockAtCursor?.(32) || null;
    const position = request.position;
    if (![position.x, position.y, position.z].every(Number.isFinite)) return null;
    return bot.blockAt(new Vec3(Math.trunc(position.x), Math.trunc(position.y), Math.trunc(position.z)));
  }

  async execute(request, origin = { type: 'gui' }) {
    const bot = this.bot;
    if (!bot?.entity) throw new Error('An active connection is required.');
    const actionId = String(request?.actionId || '');
    this.cache = null;
    if (actionId.startsWith('entity.')) return this.executeEntity(actionId, request, bot, origin);
    if (actionId.startsWith('block.')) return this.executeBlock(actionId, request, bot);
    throw new Error('Unknown target action.');
  }

  async executeEntity(actionId, request, bot, origin) {
    const entity = this.findEntity(request, bot);
    if (!entity?.isValid && entity?.isValid !== undefined) throw new Error('The entity is no longer available.');
    if (!entity) throw new Error('The entity is no longer available.');
    const description = this.describeEntity(entity, bot);
    if (actionId === 'entity.inspect') return { message: `[Entity] ${description.displayName}\nType: ${description.kind}\nDistance: ${description.distance} blocks\nPosition: ${positionText(entity.position)}${description.text ? `\nText: ${description.text}` : ''}` };
    if (actionId === 'entity.goto' || actionId === 'entity.pickup') {
      const range = actionId === 'entity.pickup' ? 0 : Math.max(1, Math.min(16, Number(request.range) || 2));
      await navigateGoal(bot, new GoalNear(entity.position.x, entity.position.y, entity.position.z, range), { description: description.displayName });
      return { message: actionId === 'entity.pickup' ? `[Entity] Moved to collect ${description.displayName}.` : `[Entity] Reached ${description.displayName}.` };
    }
    if (actionId === 'entity.stash') {
      if (description.kind !== 'item') throw new Error('Only dropped items can start a nearby stash run.');
      if (!this.stash) throw new Error('Item stashing is not available.');
      const status = this.stash.start({
        mode: 'nearby',
        collectionRadius: Math.max(16, Math.ceil(description.distance || 0) + 1),
        containerRadius: request.containerRadius
      });
      return { message: `[Stash] Collecting nearby items for storage at ${status.containerPosition.x}, ${status.containerPosition.y}, ${status.containerPosition.z}.` };
    }
    if (actionId === 'entity.look') {
      await bot.lookAt(entity.position.offset(0, entity.height ? entity.height / 2 : 0.5, 0), true);
      return { message: `[Entity] Looking at ${description.displayName}.` };
    }
    if (actionId === 'entity.trade') {
      if (description.kind !== 'villager') throw new Error('The selected entity is not a villager.');
      if (description.distance > 4.5) await navigateGoal(bot, new GoalNear(entity.position.x, entity.position.y, entity.position.z, 3), { description: description.displayName });
      await bot.openVillager(entity);
      return { message: `[Villager] Opened trading with ${description.displayName}.` };
    }
    if (actionId === 'entity.activate') {
      if (description.distance > 4.5) await navigateGoal(bot, new GoalNear(entity.position.x, entity.position.y, entity.position.z, 3), { description: description.displayName });
      await bot.activateEntity(entity);
      return { message: `[Entity] Interacted with ${description.displayName}.` };
    }
    if (actionId === 'entity.useitem') {
      if (description.distance > 4.5) await navigateGoal(bot, new GoalNear(entity.position.x, entity.position.y, entity.position.z, 3), { description: description.displayName });
      await bot.useOn(entity);
      return { message: `[Entity] Used the held item on ${description.displayName}.` };
    }
    if (actionId === 'entity.attack' && description.kind === 'player') {
      return this.playerActions.execute({
        actionId: 'player.attack',
        username: description.username,
        overrideFriendProtection: request.overrideFriendProtection === true,
        confirmOverride: request.confirmOverride === true
      }, { bot, activities: this.activities, origin });
    }
    if (actionId === 'entity.attack') {
      if (description.kind === 'item') throw new Error('Dropped items cannot be attacked.');
      if (description.distance > 4.5) throw new Error('The entity is outside attack range.');
      await bot.attack(entity);
      return { message: `[Combat] Attacked ${description.displayName}.` };
    }
    throw new Error('The target action is not available for this entity.');
  }

  async executeBlock(actionId, request, bot) {
    let block = this.findBlock(request, bot);
    if (!block || block.name === 'air') throw new Error('The block is no longer available.');
    const name = block.displayName || block.name;
    if (actionId === 'block.inspect') return { message: `[Block] ${name}\nName: ${block.name}\nPosition: ${positionText(block.position)}\nDistance: ${roundedDistance(bot, block.position)} blocks\nHardness: ${Number.isFinite(block.hardness) ? block.hardness : 'Unknown'}` };
    if (actionId === 'block.goto') {
      await navigateGoal(bot, new GoalNear(block.position.x, block.position.y, block.position.z, Math.max(1, Math.min(16, Number(request.range) || 2))), { description: positionText(block.position) });
      return { message: `[Block] Reached ${name}.` };
    }
    if (actionId === 'block.look') {
      await bot.lookAt(block.position.offset(0.5, 0.5, 0.5), true);
      return { message: `[Block] Looking at ${name}.` };
    }
    if (actionId === 'block.activate') {
      if (roundedDistance(bot, block.position) > 4.5) {
        await navigateGoal(bot, new GoalNear(block.position.x, block.position.y, block.position.z, 3), { description: positionText(block.position) });
        block = bot.blockAt(block.position);
      }
      if (!block || block.name === 'air') throw new Error('The block changed before it could be used.');
      await bot.activateBlock(block);
      return { message: `[Block] Used ${name}.` };
    }
    if (actionId === 'block.dig') {
      if (roundedDistance(bot, block.position) > 5.5) {
        await navigateGoal(bot, new GoalNear(block.position.x, block.position.y, block.position.z, 4), { description: positionText(block.position) });
        block = bot.blockAt(block.position);
      }
      if (!block || block.name === 'air') throw new Error('The block changed before it could be mined.');
      await this.mining.mineOnce(block, request.policy);
      return { message: `[Mining] Mined ${name}.` };
    }
    if (actionId === 'block.mine-exact' || actionId === 'block.mine-held' || actionId === 'block.mine-depth') {
      if (roundedDistance(bot, block.position) > 5.5) throw new Error('Move within mining range before locking this block.');
      const depth = actionId === 'block.mine-depth' ? Math.max(1, Math.min(16, Number(request.depth) || 4)) : 1;
      const policy = actionId === 'block.mine-held' ? { ...request.policy, tool: 'held', lowDurability: 'stop', minimumDurability: 10 } : request.policy;
      this.mining.startConsistent(block, depth, policy);
      return { message: `[Mining] Repeating ${depth === 1 ? 'the locked block' : `${depth} locked blocks`} from ${positionText(block.position)}.` };
    }
    if (actionId === 'block.tree-inspect') {
      if (!this.trees) throw new Error('Tree planning is not available.');
      return this.trees.inspect({ position: block.position, policy: request.policy });
    }
    if (actionId === 'block.tree-fell') {
      if (!this.trees) throw new Error('Tree planning is not available.');
      const status = this.trees.start({ mode: 'fell', position: block.position, policy: request.policy });
      return { message: `[Tree] Started ${status.currentTree?.species || treeSpecies(block) || leafSpecies(block)} tree plan at ${positionText(block.position)}.`, status };
    }
    throw new Error('The target action is not available for this block.');
  }

}

module.exports = { BLOCK_ACTIONS, ENTITY_ACTIONS, TargetingService, droppedItem, entityKind, entityName, entityText };
