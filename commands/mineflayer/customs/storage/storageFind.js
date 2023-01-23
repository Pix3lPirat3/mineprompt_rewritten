let { GoalLookAtBlock } = require('mineflayer-pathfinder').goals;

//let Cuboid = require('./../../../src/js/cuboid.js')
var v = require('vec3');

module.exports = {
  command: 'storageFind',
  description: 'Grab items from the database and find the chest with that item.',
  requires: {
    entity: true
  },


  // DOUBLE CHEST DETECTION 1.13+: chests.forEach((chest) => console.log(bot.blockAt(chest).getProperties().type)) // type can return [left, right, single]

  author: 'Pix3lPirat3',
  execute: async function(sender, command, args) {
    let find_item = args[0]
    let find_amount = Number(args[1]);

    let matching_chests = bot.storage_manager.filter(obj => obj.items.find((item) => item.name === find_item));
    let chest_locations = matching_chests.map(chest => chest.location);

    for(var a = 0; a < chest_locations.length; a++) {
      if(find_amount <= 0) continue; // We've already withdrawn enough items
      let chest = bot.blockAt(chest_locations[a]);
      await bot.pathfinder.goto(new GoalLookAtBlock(chest.position, bot.world));
      let chest_window = await bot.openContainer(bot.blockAt(chest.position));
      let chest_items = chest_window.containerItems();
      
      let chest_matches = chest_items.filter(item => item.name === find_item);
      for(let b = 0; b < chest_matches.length; b++) {
        let item = chest_matches[b];
        let withdraw_amount = Math.min(item.count, find_amount)
        await chest_window.withdraw(item.type, null, withdraw_amount, null)
        find_amount -= withdraw_amount;
        await bot.closeWindow(chest_window)
      }
      // TODO: Update the container's items after withdrawing the items




    }
    // The bot's done withdrawing items

    
    let nearest_player = bot.nearestEntity(entity => entity.type === 'player');
    await bot.lookAt(nearest_player.position.offset(0, 1, 0));



    let player_items = bot.inventory.items().filter(item => item.name === find_item);
    for(let a = 0; a < player_items.length; a++) {
      let item = player_items[a];
      await bot.toss(item.type, null, item.count)
    }

  }
}