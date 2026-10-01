'use strict';

const DIRECTIONS = new Map([
  ['s', 0],
  ['south', 0],
  ['sw', Math.PI / 4],
  ['southwest', Math.PI / 4],
  ['w', Math.PI / 2],
  ['west', Math.PI / 2],
  ['nw', Math.PI * 3 / 4],
  ['northwest', Math.PI * 3 / 4],
  ['n', Math.PI],
  ['north', Math.PI],
  ['ne', -Math.PI * 3 / 4],
  ['northeast', -Math.PI * 3 / 4],
  ['e', -Math.PI / 2],
  ['east', -Math.PI / 2],
  ['se', -Math.PI / 4],
  ['southeast', -Math.PI / 4]
]);

module.exports = {
  command: 'turn',
  usage: 'turn <north|northeast|east|southeast|south|southwest|west|northwest> [force]',
  description: 'Turn toward a cardinal or intercardinal direction.',
  requires: { entity: true },
  autocomplete: () => ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'],

  async execute(sender, command, args, { bot }) {
    if (args.length < 1 || args.length > 2) return sender.reply(`[Turn] Usage: ${this.usage}`);
    const direction = args[0].toLowerCase();
    const yaw = DIRECTIONS.get(direction);
    if (yaw === undefined) return sender.reply(`[Turn] Unknown direction "${args[0]}".`);
    const forceValue = args[1]?.toLowerCase();
    if (forceValue !== undefined && !['true', 'false'].includes(forceValue)) return sender.reply('[Turn] Force must be true or false.');
    await bot.look(yaw, 0, forceValue === 'true');
    return sender.reply(`[Turn] Facing ${direction}.`);
  }
};
