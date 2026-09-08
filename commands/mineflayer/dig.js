'use strict';

const { Vec3 } = require('vec3');
const { GoalNear } = require('mineflayer-pathfinder').goals;

module.exports = {
  command: 'dig',
  usage: 'dig [cursor | x y z]',
  description: 'Dig the targeted block or the block at specific coordinates.',
  requires: { entity: true },

  async execute(sender, command, args, { bot }) {
    if (bot.targetDigBlock) {
      await bot.stopDigging();
      return sender.reply('[Dig] Stopped the current dig.');
    }

    if (args.length === 0 || args[0].toLowerCase() === 'cursor') {
      const block = bot.blockAtCursor(4.5);
      if (!block) return sender.reply('[Dig] No block is within reach of the cursor.');
      sender.reply(`[Dig] Digging ${block.displayName || block.name}.`);
      return bot.dig(block);
    }

    if (args.length !== 3) return sender.reply(`[Dig] Usage: ${this.usage}`);
    const coordinates = args.map(Number);
    if (coordinates.some((value) => !Number.isFinite(value))) return sender.reply('[Dig] Coordinates must be numbers.');
    const position = new Vec3(...coordinates.map(Math.trunc));
    await bot.pathfinder.goto(new GoalNear(position.x, position.y, position.z, 2));
    const block = bot.blockAt(position);
    if (!block || block.name === 'air') return sender.reply(`[Dig] No solid block exists at ${position}.`);
    sender.reply(`[Dig] Digging ${block.displayName || block.name} at ${position}.`);
    return bot.dig(block);
  }
};
