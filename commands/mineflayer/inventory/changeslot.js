'use strict';

module.exports = {
  command: 'changeslot',
  usage: 'changeslot <0-8>',
  aliases: ['setslot'],
  description: 'Change your selected slot in the hotbar.',
  requires: { entity: true },
  autocomplete: () => ['0', '1', '2', '3', '4', '5', '6', '7', '8'],

  execute(sender, command, args) {
    if (args.length !== 1) return sender.reply(`[ChangeSlot] Usage: ${this.usage}`);

    const slot = Number(args[0]);
    if (!Number.isInteger(slot) || slot < 0 || slot > 8) return sender.reply('[ChangeSlot] Slot must be an integer from 0 to 8.');

    bot.setQuickBarSlot(slot);
    return sender.reply(`[ChangeSlot] Selected hotbar slot ${slot}.`);
  }
};
