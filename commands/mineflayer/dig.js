'use strict';

module.exports = {
  command: 'dig',
  usage: 'dig [cursor | x y z]',
  description: 'Dig the targeted block or the block at specific coordinates.',
  capability: 'world',
  risk: 'dangerous',
  approval: 'recommended',
  requires: { entity: true },

  async execute(sender, command, args, { activities, bot, dispatchTargetAction }) {
    if (bot.targetDigBlock) {
      if (!activities.stop('regionmine') && !activities.stop('consistentmine')) await bot.stopDigging();
      return sender.reply('[Dig] Stopped the current dig.');
    }

    if (args.length === 0 || args[0].toLowerCase() === 'cursor') {
      const result = await dispatchTargetAction({ actionId: 'block.dig', target: 'cursor' }, sender);
      return sender.reply(result.message);
    }

    if (args.length !== 3) return sender.reply(`[Dig] Usage: ${this.usage}`);
    const coordinates = args.map(Number);
    if (coordinates.some((value) => !Number.isFinite(value))) return sender.reply('[Dig] Coordinates must be numbers.');
    const [x, y, z] = coordinates.map(Math.trunc);
    const result = await dispatchTargetAction({ actionId: 'block.dig', target: 'position', position: { x, y, z } }, sender);
    return sender.reply(result.message);
  }
};
