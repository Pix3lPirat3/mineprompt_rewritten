// /entity <id|entitytype> <attack|use>

let stringTable = require('string-table')
let { GoalNear } = require('mineflayer-pathfinder').goals;

module.exports = {
  command: 'entities',
  usage: 'entities <flags>',
  description: 'Get a list of entities around you.',
  requiresEntity: true,
  execute: async function(sender, command, args) {
    if(sender.type === 'player') return sender.reply('[Entity] You must run this command from console.');
    let entities = Object.values(bot.entities).map(entity => ({
      id: entity.id,
      type: entity.type,
      mob: (entity.type === 'player') ? 'Player' : entity.mobType,
      name: (entity.type === 'player') ? entity.username : (entity.getCustomName()) ? entity.getCustomName().extra[0].toAnsi() : entity.name,
      position: Object.values(entity.position.floored()).join(', '),
      dist: bot.entity.position.distanceTo(entity.position).toFixed(0)
    })).sort((a, b) => a.dist - b.dist);

    let sortFlags = Object.keys(entities[0]);
    console.log('sortFlags:')
    console.log(sortFlags);

    console.log('entity:')
    console.log(entities)


    /*
      FLAGS:
        range
        mob/type
        name
    */

    console.log('\n' + stringTable.create(entities) + '\n')

/*
    console.log(`\n[ID] | Type | Username or Name\n`)
    for (var a = 0; a < nearby.length; a++) {
      let entity = nearby[a];
      console.log(entity)
      console.log(`[${entity.id}] | ${entity.type} | ${entity.username || entity.name}`)
    }
    console.log('')
*/

    /*
    if(args[0]) {
      let target_entity = Object.values(bot.entities).find(e => e.id === args[0]);
      let { x, y, z } = target_entity.position;
      if(bot.entity.position.distanceTo(target_entity.position) > 3.5) await bot.pathfinder.goto(new GoalNear(x, y, z, 3.5));
      await bot.lookAt(target_entity.position, true);
      await bot.activateEntity(target_entity);
    }
    */




  }
}