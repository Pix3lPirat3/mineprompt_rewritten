let { GoalFollow } = require('mineflayer-pathfinder').goals;

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

module.exports = {
  command: 'guard',
  description: 'Guard you or a specific player.',
  requiresEntity: true,
  author: 'Pix3lPirat3',
  execute: function(sender, command, args) {
    let target;
    if(args.length === 0 && sender.type === 'player') {
      if(sender.type === 'player') {
        target = bot.players[sender.player]?.entity;
        if(!target) return sender.reply(`Unable to find the player ${target}`);
        sender.reply(`I will now start guarding: ${target.username}`)
      } else {
        // The command was sent from terminal or discord
        sender.reply(`You must specify a player to guard.`)
      }
    }

    bot.pathfinder.setGoal(new GoalFollow(target, 3), true)
    let is_attacking = false;
    bot.on('physicTick', async function() {
      if(is_attacking) return;
      if(!target) return console.log(`I can no longer see ${target.username}`);
      let nearby_entities = Object.values(bot.entities).filter(e => e.username !== 'Pix3lP3nguin' && e.username !== bot.username && (e.type === 'player' || e.type === 'hostile') && target.position.distanceTo(e.position) < 4).sort((a, b) => a.position - b.position);
      if(!nearby_entities.length) return;
      let targeting = nearby_entities[0];
      is_attacking = true;
      if(bot.entityAtCursor()?.id !== targeting.id) bot.lookAt(targeting.position.offset(0, 1, 0), true);
      bot.attack(targeting);
      is_attacking = false;
      await delay(1000);
    })


  }
}