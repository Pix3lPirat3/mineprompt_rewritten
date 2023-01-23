let { GoalNear } = require('mineflayer-pathfinder').goals;

module.exports = {
  command: 'goto',
  usage: 'goto <player || x y z>',
  description: 'Go to a player or xyz coordinates.',
  requires: {
    entity: true
  },
  author: 'Pix3lPirat3',
  execute: async function(sender, command, args) {
    if(args.length === 1) {
      let target = bot.players[args[0]]?.entity;
      if(!target) sender.reply(`[Goto] I cannot see the player ${args[0]}`);
      let { x, y, z } = target.position;
      sender.reply(`[Goto] Now navigating to ${target.username}`)
      await bot.pathfinder.goto(new GoalNear(x, y, z, 2))
    }
    if(args.length === 3) {
      console.log(args)
      let [ x, y, z ] = args;
      sender.reply(`Going to ${x} ${y} ${z}`)
      await bot.pathfinder.goto(new GoalNear(x, y, z, 2));
    }
  }
}