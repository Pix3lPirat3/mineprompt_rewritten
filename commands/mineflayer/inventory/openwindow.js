'use strict';

const { Vec3 } = require('vec3');
const { GoalLookAtBlock } = require('mineflayer-pathfinder').goals;
const { navigateGoal } = require('../../../src/main/navigation-service');

function nearbyVillager(bot) {
  return bot.nearestEntity((entity) => entity.name === 'villager' && bot.entity.position.distanceTo(entity.position) <= 4.5);
}

function opener(bot, block) {
  if (/(furnace|smoker)$/u.test(block.name)) return () => bot.openFurnace(block);
  if (block.name === 'enchanting_table') return () => bot.openEnchantmentTable(block);
  if (block.name.includes('anvil')) return () => bot.openAnvil(block);
  return () => bot.openBlock(block);
}

module.exports = {
  command: 'openwindow',
  usage: 'openwindow [x y z|villager]',
  description: 'Open a nearby container, workstation, or villager window.',
  requires: { entity: true },

  async execute(sender, command, args, { bot }) {
    if (args[0]?.toLowerCase() === 'villager') {
      const villager = nearbyVillager(bot);
      if (!villager) return sender.reply('[OpenWindow] No villager is within reach.');
      await bot.openVillager(villager);
      return sender.reply('[OpenWindow] Opened villager trading.');
    }
    let block;
    if (!args.length) {
      block = bot.blockAtCursor(4.5);
    } else if (args.length === 3) {
      const coordinates = args.map(Number);
      if (coordinates.some((value) => !Number.isFinite(value))) return sender.reply('[OpenWindow] Coordinates must be numbers.');
      const position = new Vec3(...coordinates.map(Math.trunc));
      block = bot.blockAt(position);
      if (block && bot.entity.position.distanceTo(position) >= 4) {
        await navigateGoal(bot, new GoalLookAtBlock(position, bot.world), { description: `${position.x}, ${position.y}, ${position.z}` });
        block = bot.blockAt(position);
      }
    } else {
      return sender.reply(`[OpenWindow] Usage: ${this.usage}`);
    }
    if (!block || block.name === 'air') return sender.reply('[OpenWindow] No usable block was found.');
    await opener(bot, block)();
    return sender.reply(`[OpenWindow] Opened ${block.displayName || block.name}.`);
  }
};
