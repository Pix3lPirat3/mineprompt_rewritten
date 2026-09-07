module.exports = {
  command: 'turn',
  usage: 'turn <cardinal-direction> [force {false}]',
  description: 'Turn to a cardinal direction',
  requires: {
    entity: true
  },
  autocomplete: () => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'],
  author: 'Pix3lPirat3',
  execute: async function(sender, command, args) {
    if (!args.length) return sender.reply(`[${this.command}] ${this.usage}`);

    const degrees_to_radians = deg => (deg * Math.PI) / 180.0;

    let target = args[0].toLowerCase();
    if (args[1] !== undefined && !['true', 'false'].includes(args[1].toLowerCase())) return sender.reply('[Turn] Force must be true or false.');
    const force = args[1]?.toLowerCase() === 'true';

    let cardinal_to_degree = [{
      terms: ['n', 'north'],
      degrees: 0
    }, {
      terms: ['ne', 'northeast'],
      degrees: -45
    }, {
      terms: ['e', 'east'],
      degrees: -90
    }, {
      terms: ['se', 'southeast'],
      degrees: -135
    }, {
      terms: ['s', 'south'],
      degrees: -180
    }, {
      terms: ['sw', 'southwest'],
      degrees: -225
    }, {
      terms: ['w', 'west'],
      degrees: -270
    }, {
      terms: ['nw', 'northwest'],
      degrees: -315
    }]

    let cardinals = ['n', 'north', 'ne', 'northeast', 'e', 'east', 'se', 'southeast', 's', 'south', 'sw', 'southwest', 'w', 'west', 'nw', 'northwest'];
    if(!cardinals.includes(target)) return sender.reply(`[${this.command}] ${target} is not a cardinal direction (${cardinals.join(', ')})`);

    let target_degrees = degrees_to_radians(cardinal_to_degree.find(deg => deg.terms.includes(target)).degrees);

    sender.reply(`[${this.command}] Now looking ${target} (${target_degrees})`);
    return await bot.look(target_degrees, 0, force);

  }
}
