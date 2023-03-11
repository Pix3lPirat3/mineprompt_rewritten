let stringTable = require('string-table')

module.exports = {
  command: 'inventory',
  usage: 'inventory',
  aliases: ['inv'],
  description: 'Show the bot\'s inventory.',
  requires: {
    entity: true,
    console: true
  },
  author: 'Pix3lPirat3',
  execute: function(sender, command, args) {

    let inventory_items = bot.inventory.items();
    if(!inventory_items.length) return sender.reply(`[inventory] There are no items in your inventory.`);

    let items = Object.values(inventory_items).map((item, index) => ({
        slot: index,
        name: item ? item.name : null,
        count: item ? item.count : null,
        displayName: item ? getCustomName(item) : null, // displayName gets the outer field (toAnsi breaks character width)
    }));

    sender.reply(stringTable.create(items))

    function getCustomName(item) {
      if(!item.customName) return item.displayName;
      let data = bot.registry.version['<']('1.13') ? item.customName : JSON.parse(item.customName);
      let ansi = new ChatMessage(data).toAnsi(bot.registry.language, {
          '§0': '\u001b[38;5;240m',
          '§1': '\u001b[38;5;19m',
          '§2': '\u001b[38;5;34m',
          '§3': '\u001b[38;5;37m',
          '§4': '\u001b[38;5;124m',
          '§5': '\u001b[38;5;127m',
          '§6': '\u001b[38;5;214m',
          '§7': '\u001b[38;5;250m',
          '§8': '\u001b[38;5;245m',
          '§9': '\u001b[38;5;63m',
          '§a': '\u001b[38;5;83m',
          '§b': '\u001b[38;5;87m',
          '§c': '\u001b[38;5;203m',
          '§d': '\u001b[38;5;207m',
          '§e': '\u001b[38;5;227m',
          '§f': '\u001b[97m',
          '§l': '\u001b[1m',
          '§o': '\u001b[3m',
          '§n': '\u001b[4m',
          '§m': '\u001b[9m',
          '§k': '\u001b[6m',
          '§r': '\u001b[0m'
      });
      return ansi + ' ';
    }


  }
}