module.exports = {
  command: 'useitem',
  usage: 'useitem [offhand]',
  description: 'Use the item in hand.',
  requires: {
    entity: true
  },
  author: 'Pix3lPirat3',
  execute: function(sender, command, args) {
    const useOffhand = ['offhand', 'true'].includes(args[0]?.toLowerCase());
    sender.reply(`[UseItem] Using item ${bot.heldItem?.name || 'AIR'} (Offhand: ${useOffhand})`);
    bot.activateItem(useOffhand)
    return undefined;
  }
}
