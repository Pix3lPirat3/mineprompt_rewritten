let { GoalNear } = require('mineflayer-pathfinder').goals;

module.exports = {
  command: 'goto',
  usage: 'goto <player || x y z> [range]',
  description: 'Go to a player or xyz coordinates.',
  requires: {
    entity: true
  },
  autocomplete: function() {
    return Object.keys(bot.players);
  },
  author: 'Pix3lPirat3',
  execute: async function(sender, command, args) {
    let username = args[0];
    if(target = Object.values(bot.players).find(e => e.username === username)?.entity) {
      let range = args[1] || 2;
      if(!target) sender.reply(`[Goto] I cannot see the player ${username}`);
      let { x, y, z } = target.position;
      sender.reply(`[Goto] Now navigating to ${target.username}`)
      await bot.pathfinder.goto(new GoalNear(x, y, z, range))
    }
    if(args.length === 3) {
      console.log(args)
      let [ x, y, z ] = args;
      let range = args[3] || 2;
      sender.reply(`Going to ${x} ${y} ${z}`)
      await bot.pathfinder.goto(new GoalNear(x, y, z, range));
    }
  }
}