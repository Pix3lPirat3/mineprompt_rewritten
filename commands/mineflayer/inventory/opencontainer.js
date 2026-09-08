'use strict';

const { Vec3 } = require('vec3');
const { GoalLookAtBlock } = require('mineflayer-pathfinder').goals;

function isContainer(block) {
  return Boolean(block && /(chest|shulker_box|barrel|hopper|dispenser|dropper|container)$/u.test(block.name));
}

module.exports = {
  command: 'opencontainer',
  aliases: ['open'],
  usage: 'opencontainer [x y z]',
  description: 'Open a container under the cursor or at coordinates.',
  requires: { entity: true },

  async execute(sender, command, args, { bot }) {
    let block;
    if (!args.length) {
      block = bot.blockAtCursor(4.5);
    } else if (args.length === 3) {
      const coordinates = args.map(Number);
      if (coordinates.some((value) => !Number.isFinite(value))) return sender.reply('[OpenContainer] Coordinates must be numbers.');
      const position = new Vec3(...coordinates.map(Math.trunc));
      block = bot.blockAt(position);
      if (block && bot.entity.position.distanceTo(position) >= 4) {
        await bot.pathfinder.goto(new GoalLookAtBlock(position, bot.world));
        block = bot.blockAt(position);
      }
    } else {
      return sender.reply(`[OpenContainer] Usage: ${this.usage}`);
    }
    if (!isContainer(block)) return sender.reply('[OpenContainer] The target block is not a supported container.');
    await bot.openContainer(block);
    return sender.reply(`[OpenContainer] Opened ${block.displayName || block.name}.`);
  }
};
