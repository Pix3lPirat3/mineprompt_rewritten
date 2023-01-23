var stringSimilarity = require("string-similarity");

module.exports = {
  command: 'dropitem',
  usage: 'dropitem <name>',
  description: 'Drop all items of a specific type from your inventory.',
  requires: {
    entity: true
  },
  execute: async function(sender, command, args) {

    if (!args.length) return sender.reply('[Dropitem] You must specify an item, or "inventory"');
    if (args[0] == "inventory") {
      let items = bot.inventory.items();
      for (let a = 0; a < items.length; a++) {
        let item = items[a];
        await bot.toss(item.type, null, item.count);
        await bot.waitForTicks(10);
      }
    }

    let item = bot.inventory.items().find(item => item.name === args[0]);
    if (!item) return sender.reply(`[Dropitem] "${args[0]}" not found, did you mean: "${closestStringInArray(args[0], bot.inventory.items().map(item => item.name))}"`);

    bot.toss(item.type, null, item.count)


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