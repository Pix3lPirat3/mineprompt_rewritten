let { GoalFollow } = require('mineflayer-pathfinder').goals;

module.exports = {
  command: 'follow',
  usage: 'follow <player>',
  description: 'Follow a player',
  requires: {
    entity: true
  },
  autocomplete: function() {
    return Object.keys(bot.players);
  },
  author: 'Pix3lPirat3',
  execute: async function(sender, command, args) {

    if (sender !== 'CONSOLE' && args.length === 0) {
      // Follow player who ran the command

      let entity = bot.players[sender]?.entity;

      if (!entity) return bot.chat(`/msg ${sender} I cannot see you!`);

      bot.chat(`/msg ${sender} I will now start following you..`);
      console.log(`[Follow] Now following ${entity.username}`)

      return bot.pathfinder.setGoal(new GoalFollow(entity, 2), true);
    }

    if (!args[0]) return console.log('You must specify a player to follow.');

    let target = args[0].toLowerCase();
    let entity = null;

    if (target === 'stop') {
      bot.pathfinder.setGoal(null)
      return bot.pathfinder.stop()
      console.log('Stopped following player.');
    }
    if (target === 'nearest') {
      entity = bot.nearestEntity(e => e.type === 'player');
      if (!entity) return console.log('No nearby player found!');
      bot.pathfinder.setGoal(new GoalFollow(entity, 2), true);
      return console.log('Now following ' + entity.username);
    }

    if (target = Object.values(bot.players).filter(e => e.username === args[0])[0]?.entity) {
      if (!target) return console.log('I found no player named: ' + args[0]);
      bot.pathfinder.setGoal(new GoalFollow(target, 2), true);
      return console.log('Started following: ' + args[0]);
    }

    if (!entity) return console.log('There was no entity to follow!');

    console.log('Started following: ' + entity.username);

  }
};