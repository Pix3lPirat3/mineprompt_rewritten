'use strict';

const { createTextTable } = require('../../src/main/text-table');
const { ENTITY_ACTION_COMPLETIONS, ENTITY_COMMAND_ACTIONS } = require('../../src/main/target-actions');
const FILTERS = new Set(['all', 'items', 'players', 'villagers', 'mobs', 'other']);

function matchesFilter(entity, filter) {
  if (filter === 'all') return true;
  if (filter === 'items') return entity.kind === 'item';
  if (filter === 'players') return entity.kind === 'player';
  if (filter === 'villagers') return entity.kind === 'villager';
  if (filter === 'mobs') return entity.kind === 'mob';
  return entity.kind === 'entity';
}

module.exports = {
  command: 'entities',
  aliases: ['entity'],
  usage: 'entities [filter] [maximum-distance] | entities <id|name|cursor> <inspect|goto|look|pickup|stash|trade|activate|useitem|attack> [--override-friend-protection]',
  description: 'Browse and interact with loaded entities through shared target actions.',
  capability: 'world',
  risk: 'dangerous',
  approval: 'recommended',
  requires: { entity: true, console: true },

  autocomplete(command, args, { targets }) {
    if (args.length <= 1) return [...FILTERS, 'cursor', ...targets.snapshot().entities.map((entity) => String(entity.id))];
    if (args.length === 2 && !FILTERS.has(args[0]?.toLowerCase())) return [...ENTITY_ACTION_COMPLETIONS];
    if (args.length === 3 && args[1]?.toLowerCase() === 'attack') return ['--override-friend-protection'];
    return [];
  },

  async execute(sender, command, args, { dispatchTargetAction, targets }) {
    const second = args[1]?.toLowerCase();
    if (second && ENTITY_COMMAND_ACTIONS[second]) {
      const result = await dispatchTargetAction({
        actionId: ENTITY_COMMAND_ACTIONS[second],
        target: args[0],
        overrideFriendProtection: args.slice(2).includes('--override-friend-protection')
      }, sender);
      return sender.reply(result.message);
    }
    const first = args[0]?.toLowerCase();
    const filter = FILTERS.has(first) ? first : 'all';
    const distanceArgument = FILTERS.has(first) ? args[1] : args[0];
    const maximumDistance = distanceArgument === undefined ? 32 : Number(distanceArgument);
    if (!Number.isFinite(maximumDistance) || maximumDistance < 0) return sender.reply('[Entities] Maximum distance must be a non-negative number.');
    const rows = targets.snapshot(maximumDistance).entities.filter((entity) => matchesFilter(entity, filter)).map((entity) => ({
      id: entity.id,
      type: entity.kind,
      name: entity.displayName,
      position: `${entity.position.x}, ${entity.position.y}, ${entity.position.z}`,
      distance: entity.distance
    }));
    return sender.reply(rows.length ? createTextTable(rows) : '[Entities] No matching entities are loaded.');
  }
};
