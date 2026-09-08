'use strict';

const { createTextTable } = require('../../src/main/text-table');

module.exports = {
  command: 'entities',
  usage: 'entities [maximum-distance]',
  description: 'List nearby loaded entities.',
  requires: { entity: true, console: true },

  execute(sender, command, args, { bot }) {
    const maximumDistance = args[0] === undefined ? Number.POSITIVE_INFINITY : Number(args[0]);
    if (!Number.isFinite(maximumDistance) && args[0] !== undefined || maximumDistance < 0) {
      return sender.reply('[Entities] Maximum distance must be a non-negative number.');
    }
    const rows = Object.values(bot.entities)
      .map((entity) => ({
        id: entity.id,
        type: entity.type || 'unknown',
        name: entity.username || entity.mobType || entity.name || 'unknown',
        position: entity.position?.floored().toString() || 'unknown',
        distance: bot.entity.position.distanceTo(entity.position).toFixed(1)
      }))
      .filter((entity) => Number(entity.distance) <= maximumDistance)
      .sort((a, b) => Number(a.distance) - Number(b.distance));
    return sender.reply(rows.length ? createTextTable(rows) : '[Entities] No matching entities are loaded.');
  }
};
