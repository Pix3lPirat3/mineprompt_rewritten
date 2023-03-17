var v = require('vec3');

// block (findBlock)[0]
// pos (x, y, z)
module.exports = {
  command: 'lookat',
  usage: 'lookat < block | x y z> [force {false}]',
  description: 'Turn to look at a block/position',
  requires: {
    entity: true
  },
  author: 'Pix3lPirat3',
  execute: async function(sender, command, args) {
    if (!args.length) return sender.reply(`[${this.command}] ${this.usage}`);

    if(args.length === 1 || args.length === 2) {
      let force = args[1] || false;
      let block = bot.registry.blocksByName[args[0]];
      if(!block) return sender.reply(`[LookAt] There is no block called ${args[0]}`);
      let nearest = await bot.findBlock({ matching: block.id });
      if(!nearest) return sender.reply(`[LookAt] There are no ${args[0]} blocks nearby.`);
      sender.reply(`[LookAt] Turning towards ${block.name} ${nearest.position}`)
      await bot.lookAt(nearest.position.offset(0.5, 0.5, 0.5), force)
      sender.reply(`[LookAt] Now looking at ${block.name} ${nearest.position}`)
    }

    // lookat x y z {force}
    if(args.length === 3 || args.length === 4) {
      let force = args[3] || 'false';

      let [x, y, z] = args;
      x = cleanInt(x);
      if (isNaN(x)) return sender.reply(`[LookAt] Unable to parse input, X: ${x} is invalid.`);
      y = cleanInt(y);
      if (isNaN(y)) return sender.reply(`[LookAt] Unable to parse input, Y: ${y} is invalid.`);
      z = cleanInt(z);
      if (isNaN(y)) return sender.reply(`[LookAt] Unable to parse input, Z: ${z} is invalid.`);

      let block = bot.blockAt(v(x, y, z));
      sender.reply(`[LookAt] Turning towards ${block.name} ${block.position}`)
      await bot.lookAt(block.position.offset(0.5, 0.5, 0.5), force)
      sender.reply(`[LookAt] Now looking at ${block.name} ${block.position}`)
    }



    function cleanInt(x) {
      x = Number(x);
      return x >= 0 ? Math.floor(x) : Math.ceil(x);
    }

  }
}