const util = require('util')

module.exports = {
  command: 'blockinfo',
  description: 'Print the block data at the target.',
  requiresEntity: true,
  execute: function(sender, command, args) {

    // No Argument (or "cursor" argument) - Default to blockAtCursor
    if (args.length === 0 || args[0].toLowerCase() === 'cursor') {
      let blockAtCursor = bot.blockAtCursor();
      if (!blockAtCursor) return sender.reply(`[Blockinfo] There is no block at my cursor.`);

      let distance = bot.entity.position.distanceTo(blockAtCursor.position).toFixed(2);

      let blockInfo = util.inspect(blockAtCursor, { showHidden: false, depth: null, colors: true });
      if(sender.type === 'player') sender.reply(`Block At Cursor: ${distance} blocks away (Check Console)`);
      console.log('\n' + util.inspect(blockAtCursor, { showHidden: false, depth: null, colors: true }) + '\n')
    }

    // blockinfo <x> <y> <z>
    if (args.length === 3) {
      let [x, y, z] = args;
      x = cleanInt(x);
      if (isNaN(x)) return sender.reply(`[Bed] Unable to go to bed, X: ${x} is invalid.`);
      y = cleanInt(y);
      if (isNaN(y)) return sender.reply(`[Bed] Unable to go to bed, Y: ${y} is invalid.`);
      z = cleanInt(z);
      if (isNaN(y)) return sender.reply(`[Bed] Unable to go to bed, Z: ${z} is invalid.`);
      return ''; // TODO: Get block at XYZ and print it
    }

    function cleanInt(x) {
      x = Number(x);
      return x >= 0 ? Math.floor(x) : Math.ceil(x);
    }
  }
}