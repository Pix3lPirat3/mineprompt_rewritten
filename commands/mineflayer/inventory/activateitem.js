module.exports = {
  command: 'activateitem',
  usage: 'activateitem [offhand]',
  description: 'Activate the item in hand.',
  usage: 'activateitem [offhand]',
  requires: {
    entity: true
  },
  author: 'Pix3lPirat3',
  execute: function(sender, command, args) {
    var useOffhand = (args[0] === 'true');
    sender.reply(`[UseItem] Using item ${bot.heldItem?.name || 'AIR'} (Offhand: ${useOffhand})`);
    bot.activateItem(useOffhand)
  }
}