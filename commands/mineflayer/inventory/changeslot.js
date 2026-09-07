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

    const slot = Number(args[0]);
    if (!Number.isInteger(slot) || slot < 0 || slot > 8) return sender.reply('[ChangeSlot] Slot must be an integer from 0 to 8.');

    bot.setQuickBarSlot(slot);
    return sender.reply(`[ChangeSlot] Selected hotbar slot ${slot}.`);
  }
}
