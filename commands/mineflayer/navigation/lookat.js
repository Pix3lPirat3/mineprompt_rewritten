// block (findBlock)[0]
// pos (x, y, z)
module.exports = {
  command: 'lookat',
  usage: 'lookat <block|pos> [force {false}]',
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
      if(!block) return sender.reply(`[lookat] There is no block called ${args[0]}`);
      let nearest = await bot.findBlock({ matching: block.id });
      if(!nearest) return sender.reply(`[lookat] There are no ${args[0]} blocks nearby.`);
      sender.reply(`[lookat] Turning towards ${block.name} ${nearest.position}`)
      await bot.lookAt(nearest.position.offset(0.5, 0.5, 0.5), force)
      sender.reply(`[lookat] Now looking at ${block.name} ${nearest.position}`)
    }
    if(args.length === 3 || args.length === 4) {
      let force = args[0] || 'false';
      // lookat x y z {force}
    }

  }
}