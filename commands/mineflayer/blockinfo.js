'use strict';

const util = require('node:util');
const { Vec3 } = require('vec3');

module.exports = {
  command: 'blockinfo',
  usage: 'blockinfo [cursor | x y z]',
  description: 'Inspect the block under the cursor or at coordinates.',
  requires: { entity: true, console: true },

  execute(sender, command, args) {
    let block;
    if (args.length === 0 || args[0]?.toLowerCase() === 'cursor') {
      block = bot.blockAtCursor();
    } else if (args.length === 3) {
      const coordinates = args.map(Number);
      if (coordinates.some((value) => !Number.isFinite(value))) return sender.reply('[BlockInfo] Coordinates must be numbers.');
      block = bot.blockAt(new Vec3(...coordinates.map(Math.trunc)));
    } else {
      return sender.reply(`[BlockInfo] Usage: ${this.usage}`);
    }
    if (!block) return sender.reply('[BlockInfo] No block was found.');
    return sender.reply(util.inspect(block, { colors: false, depth: 4, maxArrayLength: 50, breakLength: 100 }));
  }
};
