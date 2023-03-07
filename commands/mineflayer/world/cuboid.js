let Cuboid = require('./../../../src/js/cuboid');
var v = require('vec3');
let { GoalNear } = require('mineflayer-pathfinder').goals;

module.exports = {
  command: 'cuboid',
  usage: 'cuboid',
  description: '',
  requires: {
    entity: true
  },
  author: 'Pix3lPirat3',
  execute: async function(sender, command, args) {

    /*
    let cuboid = new Cuboid(v(93, 85, -30), v(70, 93, -56));

    let cuboid_positions = cuboid.getBlockPositions().sort((a, b) => b.y - a.y) // Sort by layers top to bottom

    for(let a = 0; a < optimized.length; a++) {
      let pos = optimized[a];
      let block = bot.blockAt(pos);
      if(block.name === 'air') continue;

      let { x, y, z } = pos;

      if(bot.entity.position.distanceTo(pos) > 3.5) await bot.pathfinder.goto(new GoalNear(x, y, z, 2));
      if(bot.blockAtCursor.position !== pos) await bot.lookAt(pos, true);
      await bot.dig(block)
    }
    */

  }
}