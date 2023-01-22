let { GoalNear } = require('mineflayer-pathfinder').goals;

module.exports = {
  command: 'come',
  description: 'The bot will go to the player who types the command.',
  requiresEntity: true,
  author: 'Pix3lPirat3',
  execute: async function(sender, command, args) {
    if(sender.type !== 'player') return sender.reply(`[Come] This command can only be ran by a player.`);
    let player = sender.player;
    let entity = bot.players[player]?.entity;
    if(!entity) return sender.reply(`[Come] I cannot see you ${player}`);
    let { x, y, z } = entity.position;
    await bot.pathfinder.goto(new GoalNear(x, y, z, 2));
  }
}