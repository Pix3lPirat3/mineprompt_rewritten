let v = require('vec3')

const allowedWindowTypes = ['generic', 'chest', 'dispenser', 'ender_chest', 'shulker_box', 'hopper', 'container', 'dropper', 'trapped_chest', 'barrel', 'white_shulker_box', 'orange_shulker_box', 'magenta_shulker_box', 'light_blue_shulker_box', 'yellow_shulker_box', 'lime_shulker_box', 'pink_shulker_box', 'gray_shulker_box', 'light_gray_shulker_box', 'cyan_shulker_box', 'purple_shulker_box', 'blue_shulker_box', 'brown_shulker_box', 'green_shulker_box', 'red_shulker_box', 'black_shulker_box']

// Pass a Block -> Returns Boolean
function isContainer(block) {
  return allowedWindowTypes.includes(block?.name);
}

module.exports = {
  command: 'useblock',
  usage: 'useblock [x y z]',
  description: 'Place a block from a hand on a specific coordinate or open a container.',
  requires: {
    entity: true
  },
  author: 'Pix3lPirat3',
  execute: async function(sender, command, args) {
    // TODO:
    // - activateBlock
    // - placeEntity
    // - placeBlock

    let block = bot.blockAtCursor(3.5);

    // Check if there's a block at the cursor, and if the bot's holding a block
    // placeBlock
    

  }
}