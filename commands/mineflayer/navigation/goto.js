'use strict';

const { GoalNear } = require('mineflayer-pathfinder').goals;

function finiteNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${label} must be a number.`);
  return number;
}

module.exports = {
  command: 'goto',
  usage: 'goto <player> [range] | goto <x> <y> <z> [range]',
  description: 'Navigate to a visible player or coordinates.',
  requires: { entity: true },
  autocomplete: () => Object.keys(bot.players),

  async execute(sender, command, args) {
    if (args.length === 0) return sender.reply(`[Goto] Usage: ${this.usage}`);

    if (args.length <= 2) {
      const player = Object.values(bot.players).find((entry) => entry.username?.toLowerCase() === args[0].toLowerCase());
      if (!player?.entity) return sender.reply(`[Goto] Could not see ${args[0]}.`);
      const range = args[1] === undefined ? 2 : finiteNumber(args[1], 'Range');
      if (range < 0) return sender.reply('[Goto] Range cannot be negative.');
      const { x, y, z } = player.entity.position;
      sender.reply(`[Goto] Navigating to ${player.username}.`);
      return bot.pathfinder.goto(new GoalNear(x, y, z, range));
    }

    if (args.length === 3 || args.length === 4) {
      try {
        const [x, y, z] = args.slice(0, 3).map((value, index) => finiteNumber(value, ['X', 'Y', 'Z'][index]));
        const range = args[3] === undefined ? 2 : finiteNumber(args[3], 'Range');
        if (range < 0) return sender.reply('[Goto] Range cannot be negative.');
        sender.reply(`[Goto] Navigating to ${x}, ${y}, ${z}.`);
        return await bot.pathfinder.goto(new GoalNear(x, y, z, range));
      } catch (error) {
        return sender.reply(`[Goto] ${error.message}`);
      }
    }

    return sender.reply(`[Goto] Usage: ${this.usage}`);
  }
};
