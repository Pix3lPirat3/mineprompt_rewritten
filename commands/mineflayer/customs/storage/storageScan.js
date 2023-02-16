let { GoalLookAtBlock, GoalNear } = require('mineflayer-pathfinder').goals;

//let Cuboid = require('./../../../src/js/cuboid.js')
var v = require('vec3');

module.exports = {
  command: 'storageScan',
  description: 'Scan the nearby storage into a database.',
  requires: {
    entity: true
  },


  // DOUBLE CHEST DETECTION 1.13+: chests.forEach((chest) => console.log(bot.blockAt(chest).getProperties().type)) // type can return [left, right, single]

  author: 'Pix3lPirat3',
  execute: async function(sender, command, args) {

    bot.storage_manager = [];

    let chest_id = bot.registry.blocksByName['chest'].id;
    let chests = bot.findBlocks({
      matching: function(block) {
        // Get a single side of double-chests, and all single chests.
        return block.type === chest_id && (block.getProperties().type === 'single' || block.getProperties().type === 'right')
      },
      useExtraInfo: true,
      maxDistance: 16,
      count: 50
    });

    sender.reply(`I see ${chests.length} chests to scan..`);

    // loop through chest locations, navigate to each chest, open it, and store the chest items inside the bot's storage manager for later reference.
    for(let a = 0; a < chests.length; a++) {
      let chest = chests[a];
      //await bot.pathfinder.goto(new GoalLookAtBlock(chest, bot.world));

      // Only pathfind if we're greater than 3 blocks away
      if(bot.entity.position.distanceTo(chest) > 3) await bot.pathfinder.goto(new GoalNear(chest.x, chest.y, chest.z, 3));

      let chest_window = await bot.openContainer(bot.blockAt(chest));
      // OPTIONAL: Delay for servers not loading chests fast enough.
      // await delay(1000)
      let chest_items = chest_window.containerItems();
      bot.storage_manager.push({ location: chest, items: chest_items })
      console.log(`[storageScan] Chest at ${chest} has ${chest_items.length} items.`)
      await bot.closeWindow(chest_window)
    }

    console.log('Done Saving:')
    console.log(bot.storage_manager)

  }
}

// TODO:
/* make sure it's a real chest
bot.on('openChest AND closeChest', function() {
  chest_window => store in storage.array
})
*/