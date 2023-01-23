module.exports = {
  command: 'bed',
  usage: 'bed <search range || x y z>',
  description: 'Allows you to make the bot sleep easily.',
  requires: {
    entity: true
  },
  execute: async function(sender, command, args) {

    // If the bot is already sleeping wake them up.
    if(bot.isSleeping) return await bot.wake().catch(e => sender.reply('[Bed] Unable to wake up, no sleeping.'));
    // bed <leave>
    if (args[0] === 'leave') return await bot.wake().catch(e => sender.reply('[Bed] Unable to wake up, no sleeping.'));
    if (args.length === 1) {
      // bed <radius>

      let radius = cleanInt(args[0])
      if (radius < 1 || isNaN(radius)) return sender.reply(`[Bed] Invalid radius: ${args[0]}`);

      let nearestBed = bot.findBlock({
        matching: (e => e.name.endsWith('_bed')),
        maxDistance: radius
      })
      if (!nearestBed) return sender.reply(`[Bed] There is no bed within ${radius} blocks..`);

      let { x, y, z } = nearestBed.position;
      await bot.pathfinder.goto(new GoalNear(x, y, z, 2));
      await bot.sleep(nearestBed).catch(function(e) {
        sender.reply('[Bed] ' + e.message)
      })
      return;
    }
    if (args.length === 3) {
      // bed <x> <y> <z>
      let [x, y, z] = args;

      x = cleanInt(x);
      if (isNaN(x)) return sender.reply(`[Bed] Unable to go to bed, X: ${x} is invalid.`);
      y = cleanInt(y);
      if (isNaN(y)) return sender.reply(`[Bed] Unable to go to bed, Y: ${y} is invalid.`);
      z = cleanInt(z);
      if (isNaN(y)) return sender.reply(`[Bed] Unable to go to bed, Z: ${z} is invalid.`);

      await bot.pathfinder.goto(new GoalNear(x, y, z, 2));
      return await bot.sleep(bot.blockAt(v(x, y, z))).catch(function(e) {
        sender.reply('[Bed] ' + e.message)
      })

    }

    return sender.reply('[Bed] You must specify a "range" or <x> <y> <z> to find a bed')

    function cleanInt(x) {
      x = Number(x);
      return x >= 0 ? Math.floor(x) : Math.ceil(x);
    }

  }
}