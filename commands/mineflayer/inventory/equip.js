var stringSimilarity = require("string-similarity");

module.exports = {
  command: 'equip',
  usage: 'equip <item | slot> <destination (hand, head, torso, legs, feet, off-hand)>',
  description: 'Equip an item to the bot\'s hand or armor slot.',
  requires: {
    entity: true
  },
  autocomplete: () => bot.inventory.items().map(item => item.name),
  execute: async function(sender, command, args) {
    if (!args.length) return sender.reply(`[${this.command}] ${this.usage}`);

    let destinations = ['hand', 'head', 'torso', 'legs', 'feet', 'off-hand'];

    let item = bot.inventory.findInventoryItem(args[0]);

    if(!item) return sender.reply(`[Equip] There was no "${args[0]}" found in your inventory, did you mean: "${closestStringInArray(args[0], bot.inventory.items().map(item => item.name))}"`);

    let destination;
    if(args.length === 1) destination = 'hand';
    if(args.length === 2) {
      if(!destinations.includes(args[1])) return sender.reply(`[Equip] The desination "${args[1]}" is invalid. (${destinations.join(', ')})`);
      destination = args[1];
    }

    await bot.equip(item, destination)

    function closestStringInArray(str, array) {

      let removed_duplicates = array.filter((c, index) => {
        return array.indexOf(c) === index;
      });

      let close_ratings = stringSimilarity.findBestMatch(args[0], removed_duplicates); // Match the closest match to `string` in `arr(ay)` (Returns Object)
      let close_matches = close_ratings.ratings.sort((a, b) => b.rating - a.rating);
      let option_show_matches_max = 3;
      return close_matches.slice(0, option_show_matches_max).map(m => m.target).join(', ');
    }

  }
}