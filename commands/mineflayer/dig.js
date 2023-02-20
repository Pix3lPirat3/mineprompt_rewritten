module.exports = {
  command: 'dig',
  usage: 'dig [x y z]',
  description: 'Dig a block at a specific coordinate.',
  requires: {
    entity: true
  },
  execute: async function(sender, command, args) {
    // Dig block at cursor

    // If the bot is currently digging a block stop it
    if(bot.targetDigBlock) return bot.stopDigging().catch(console.log);

    if (args.length === 0 || args[0] == 'cursor') {
      let blockAtCursor = bot.blockAtCursor(4.5); // 4.5 Survival | 5 Creative
      if (!blockAtCursor) return console.log(`[Dig] There is no block at my cursor.`);
      console.log(`[Dig] Digging ${blockAtCursor.name} at cursor.`)
      await bot.dig(blockAtCursor);
    }
    // Dig block at specific coordinates
    console.log(args, args.length)
    if (args.length === 3) {
      let [x, y, z] = args;

      console.log(`[Dig] Digging block at ${x} ${y} ${z}`)

      x = cleanInt(x);
      if (isNaN(x)) return console.log(`[Dig] Unable to go to block, X: ${x} is invalid.`);
      y = cleanInt(y);
      if (isNaN(y)) return console.log(`[Dig] Unable to go to block, Y: ${y} is invalid.`);
      z = cleanInt(z);
      if (isNaN(y)) return console.log(`[Dig] Unable to go to block, Z: ${z} is invalid.`);

      await bot.pathfinder.goto(new GoalNear(x, y, z, 2));
      let blockAtPosition = bot.blockAt(v(x, y, z));
      if (blockAtPosition === null || blockAtPosition.name == 'air') return console.log(`[Dig] The target block is ${blockAtPosition?.name}`);
      await bot.dig(blockAtPosition).catch(console.log);
    }

    function cleanInt(x) {
      x = Number(x);
      return x >= 0 ? Math.floor(x) : Math.ceil(x);
    }
  }
}