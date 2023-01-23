let v = require('vec3')
let { GoalLookAtBlock } = require('mineflayer-pathfinder').goals;

const allowedWindowTypes = ['generic', 'chest', 'dispenser', 'ender_chest', 'shulker_box', 'hopper', 'container', 'dropper', 'trapped_chest', 'barrel', 'white_shulker_box', 'orange_shulker_box', 'magenta_shulker_box', 'light_blue_shulker_box', 'yellow_shulker_box', 'lime_shulker_box', 'pink_shulker_box', 'gray_shulker_box', 'light_gray_shulker_box', 'cyan_shulker_box', 'purple_shulker_box', 'blue_shulker_box', 'brown_shulker_box', 'green_shulker_box', 'red_shulker_box', 'black_shulker_box']

// Pass a Block -> Returns Boolean
function isContainer(block) {
  return allowedWindowTypes.includes(block?.name);
}

module.exports = {
  command: 'opencontainer',
  usage: 'opencontainer [x y z]',
  description: 'Open a container at cursor, or at coordinates.',
  requires: {
    entity: true
  },
  author: 'Pix3lPirat3',
  execute: async function(sender, command, args) {

    // If no args are specified open the container at the bot's cursor
    if(args.length === 0) {
      let block = bot.blockAtCursor(3.5);
      if(!isContainer(block)) return sender.reply('[openContainer] The target block is not a container.');
      return await bot.openContainer(block);
    }

    if(args.length === 3) {
      let [x, y, z] = args;
      let errors = parseVec(x, y, z);
      if(errors.length) return sender.reply(`[openContainer] There was an error parsing values: ${errors.join(', ')}`)

      let targetVec = v(x, y, z);
      if(!isContainer(bot.blockAt(targetVec))) return sender.reply(`[openContainer] The block at "${Object.values(targetVec).join(', ')}" is not a container.`)
      if(bot.entity.position.distanceTo(targetVec) < 4) {
        await bot.lookAt(targetVec);
        return await bot.openContainer(bot.blockAt(targetVec))
      }

      // The chest is a distance away, go to it
      await bot.pathfinder.goto(new GoalLookAtBlock(targetVec, bot.world));
      await bot.openContainer(bot.blockAt(targetVec))

    }

    function parseVec(x, y, z) {
      let pos = v(x, y, z);
      let errors = [];
      if(isNaN(x)) errors.push(`"X: ${x}"`);
      if(isNaN(y)) errors.push(`"Y: ${y}"`);
      if(isNaN(z)) errors.push(`"Z: ${z}"`);
      return errors;
    }

  }
}