module.exports = {
  command: 'changeslot',
  aliases: ['setslot'],
  description: 'Change your selected slot in the hotbar.',
  requiresEntity: true,
  execute: function(sender, command, args) {
    if (!args.length) return console.log('[Changeslot] You must specify a slot to change to.')

    let slot = cleanInt(args[0])
    if (slot < 0 || slot > 8 || isNaN(slot)) return sender.reply(`[Changeslot] You must specify a slot [0-8]`);

    bot.setQuickBarSlot(slot);

    function cleanInt(x) {
      x = Number(x);
      return x >= 0 ? Math.floor(x) : Math.ceil(x);
    }
  }
}