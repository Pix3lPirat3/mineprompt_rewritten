module.exports = {
  command: 'changeslot',
  usage: 'changeslot <slot (0-8)>',
  aliases: ['setslot'],
  description: 'Change your selected slot in the hotbar.',
  requires: {
    entity: true
  },
  execute: function(sender, command, args) {
    if (!args.length) return sender.reply(`[${this.command}] ${this.usage}`);

    let slot = cleanInt(args[0])
    if (slot < 0 || slot > 8 || isNaN(slot)) return sender.reply(`[Changeslot] You must specify a slot [0-8]`);

    bot.setQuickBarSlot(slot);

    function cleanInt(x) {
      x = Number(x);
      return x >= 0 ? Math.floor(x) : Math.ceil(x);
    }
  }
}