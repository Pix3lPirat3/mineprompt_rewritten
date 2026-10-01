'use strict';

const { Vec3 } = require('vec3');

function parseBoolean(value) {
  if (value === undefined || value === 'false') return false;
  if (value === 'true') return true;
  throw new TypeError('Force must be true or false.');
}

module.exports = {
  command: 'lookat',
  usage: 'lookat <block> [force] | lookat <x> <y> <z> [force]',
  description: 'Look at the nearest matching block or a position.',
  requires: { entity: true },
  autocomplete: (command, args, { bot }) => Object.keys(bot.registry.blocksByName),

  async execute(sender, command, args, { bot }) {
    if (!args.length) return sender.reply(`[LookAt] Usage: ${this.usage}`);
    try {
      if (args.length <= 2) {
        const blockType = bot.registry.blocksByName[args[0]];
        if (!blockType) return sender.reply(`[LookAt] Unknown block "${args[0]}".`);
        const nearest = bot.findBlock({ matching: blockType.id });
        if (!nearest) return sender.reply(`[LookAt] No ${blockType.displayName} is nearby.`);
        await bot.lookAt(nearest.position.offset(0.5, 0.5, 0.5), parseBoolean(args[1]));
        return sender.reply(`[LookAt] Looking at ${blockType.displayName} at ${nearest.position}.`);
      }

      if (args.length === 3 || args.length === 4) {
        const coordinates = args.slice(0, 3).map(Number);
        if (coordinates.some((value) => !Number.isFinite(value))) return sender.reply('[LookAt] Coordinates must be numbers.');
        const position = new Vec3(...coordinates);
        await bot.lookAt(position, parseBoolean(args[3]));
        return sender.reply(`[LookAt] Looking at ${position}.`);
      }
    } catch (error) {
      return sender.reply(`[LookAt] ${error.message}`);
    }
    return sender.reply(`[LookAt] Usage: ${this.usage}`);
  }
};
