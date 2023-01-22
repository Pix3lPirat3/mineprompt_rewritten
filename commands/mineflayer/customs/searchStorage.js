let { GoalLookAtBlock } = require('mineflayer-pathfinder').goals;

let Cuboid = require('./../../../src/js/cuboid.js')
var v = require('vec3');

module.exports = {
  command: 'searchStorage',
  description: 'Try to find a specific item in nearby storage.',
  requiresEntity: true,
  author: 'Pix3lPirat3',
  execute: async function(sender, command, args) {

  bot.storage_memory = []

    let cube = new Cuboid(v(-24, 63, -16), v(-22, 65, -16)); // We grab one half of the double chests

    let chest_id = bot.registry.blocksByName['chest'].id;
    let chests = bot.findBlocks({
      matching: function(block) {
        return block.type === chest_id && cube.posIsIn(block.position)
      },
      useExtraInfo: true,
      maxDistance: 16,
      count: 50
    })

    let target_item = bot.registry.itemsByName[args[0]];
    let target_amount = Number(args[1]);

    sender.reply(`[searchStorag] Searching nearby storage for ${target_item.name}`)

    console.log(`There are ${chests.length} chests to scan through..`)

    for(let a = 0; a < chests.length; a++) {
      let chest = chests[a];
      await bot.pathfinder.goto(new GoalLookAtBlock(chest, bot.world))
      let chest_window = await bot.openContainer(bot.blockAt(chest));

      // OPTIONAL: delay for server to update container

      let chest_items = chest_window.containerItems();
      let foundItems = chest_items.filter(item => item.name === target_item.name);
      // We found items matching the target in the chest, now withdraw until we get the targeted amount..
      for(let b = 0; b < foundItems.length; b++) {
        let chest_item = foundItems[b];
        await chest_window.withdraw(target_item.id, null, chest_item.amount, null).catch(console.log)
      }
      await bot.closeWindow(chest_window)
    }

    let nearest_player = bot.nearestEntity(e => e.type === 'player');
    await bot.lookAt(nearest_player.position);
    let item_in_inventory = bot.inventory.items().find(i => i.name === target_item.name);
    await bot.tossStack(item_in_inventory, null)
  }
}