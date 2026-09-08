'use strict';

const { GoalFollow } = require('mineflayer-pathfinder').goals;

module.exports = {
  command: 'follow',
  usage: 'follow <player|nearest|stop>',
  description: 'Continuously follow a visible player.',
  requires: { entity: true },
  autocomplete: (command, args, { bot }) => ['nearest', 'stop', ...Object.keys(bot.players)],

  execute(sender, command, args, { bot }) {
    let requested = args[0];
    if (!requested && sender.type === 'player') requested = sender.player;
    if (!requested) return sender.reply(`[Follow] Usage: ${this.usage}`);

    const targetName = requested.toLowerCase();
    if (targetName === 'stop') {
      bot.pathfinder.setGoal(null);
      bot.pathfinder.stop();
      return sender.reply('[Follow] Stopped following.');
    }

    const entity = targetName === 'nearest'
      ? bot.nearestEntity((candidate) => candidate.type === 'player' && candidate.username !== bot.username)
      : Object.values(bot.players).find((player) => player.username?.toLowerCase() === targetName)?.entity;
    if (!entity) return sender.reply(`[Follow] Could not see ${requested}.`);

    bot.pathfinder.setGoal(new GoalFollow(entity, 2), true);
    return sender.reply(`[Follow] Now following ${entity.username}.`);
  }
};
