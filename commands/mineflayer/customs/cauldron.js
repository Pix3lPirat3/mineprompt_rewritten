let { GoalLookAtBlock } = require('mineflayer-pathfinder').goals;
let Vec3 = require('vec3');

module.exports = {
  command: 'cauldron',
  usage: 'cauldron <type> <count>',
  description: 'Go collect a <count> amount of <type> cauldrons.',
  requires: {
    entity: true
  },
  author: 'Pix3lPirat3',
  execute: async function(sender, command, args) {
    let type = args[0];

    let cauldrons = bot.findBlocks({
        matching: bot.registry.blocksByName['lava_cauldron'].id,
        count: 32,
        maxDistance: 32
    })

    console.log(`There are ${cauldrons.length} target cauldrons nearby.`)

    for(let a = 0; a < cauldrons.length; a++) {
      let cauldron_pos = cauldrons[a];
      await bot.pathfinder.goto(new GoalLookAtBlock(cauldron_pos, bot.world, { reach: 3 }));
      
      let empty_bucket = bot.inventory.count(bot.registry.itemsByName['bucket'].id);
      if(!empty_bucket) return console.log('TERMINATING : I don\'t have any buckets');


      if(bot.heldItem?.name != 'bucket') await bot.equip(bot.inventory.findInventoryItem('bucket'));

      let cauldron_block = bot.blockAt(cauldron_pos);
      if(cauldron_block.name !== 'lava_cauldron') continue; // The target block is not a lava bucket

      await bot.activateBlock(cauldron_block, new Vec3(0, 1, 0), new Vec3(0, 1, 0))

    }

  }
}