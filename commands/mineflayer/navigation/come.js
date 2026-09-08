'use strict';

const { GoalNear } = require('mineflayer-pathfinder').goals;

module.exports = {
  command: 'come',
  usage: 'come',
  description: 'Navigate to the player who sent the command.',
  requires: { entity: true },

  async execute(sender, command, args, { bot }) {
    if (args.length) return sender.reply(`[Come] Usage: ${this.usage}`);
    if (sender.type !== 'player') return sender.reply('[Come] This command must come from an allowed player. Use "goto" from MinePrompt.');
    const target = Object.values(bot.players).find((player) => player.username?.toLowerCase() === sender.player.toLowerCase());
    if (!target?.entity) return sender.reply(`[Come] ${sender.player} is not currently visible.`);
    const { x, y, z } = target.entity.position;
    sender.reply(`[Come] Navigating to ${target.username}.`);
    return bot.pathfinder.goto(new GoalNear(x, y, z, 2));
  }
};
