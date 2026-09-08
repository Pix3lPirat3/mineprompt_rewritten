'use strict';

const { Vec3 } = require('vec3');
const { GoalNear } = require('mineflayer-pathfinder').goals;

module.exports = {
  command: 'bed',
  aliases: ['sleep'],
  usage: 'bed <search-radius | x y z | leave>',
  description: 'Find and sleep in a nearby bed, or wake up.',
  requires: { entity: true },

  async execute(sender, command, args) {
    if (bot.isSleeping || args[0]?.toLowerCase() === 'leave') {
      try {
        await bot.wake();
        return sender.reply('[Bed] Awake.');
      } catch (error) {
        return sender.reply(`[Bed] ${error.message}`);
      }
    }

    let bed;
    if (args.length === 1) {
      const radius = Number(args[0]);
      if (!Number.isInteger(radius) || radius < 1 || radius > 256) return sender.reply('[Bed] Search radius must be an integer from 1 to 256.');
      bed = bot.findBlock({ matching: (block) => block.name.endsWith('_bed'), maxDistance: radius });
      if (!bed) return sender.reply(`[Bed] No bed was found within ${radius} blocks.`);
    } else if (args.length === 3) {
      const coordinates = args.map(Number);
      if (coordinates.some((value) => !Number.isFinite(value))) return sender.reply('[Bed] Coordinates must be numbers.');
      bed = bot.blockAt(new Vec3(...coordinates.map(Math.trunc)));
      if (!bed?.name.endsWith('_bed')) return sender.reply('[Bed] The target block is not a bed.');
    } else {
      return sender.reply(`[Bed] Usage: ${this.usage}`);
    }

    try {
      await bot.pathfinder.goto(new GoalNear(bed.position.x, bed.position.y, bed.position.z, 2));
      await bot.sleep(bed);
      return sender.reply('[Bed] Sleeping.');
    } catch (error) {
      return sender.reply(`[Bed] ${error.message}`);
    }
  }
};
