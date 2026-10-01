'use strict';

module.exports = {
  command: 'changeslot',
  usage: 'changeslot <0-8>',
  aliases: ['setslot'],
  description: 'Select a hotbar slot. This is a shortcut for inventory select.',
  requires: { entity: true },
  autocomplete: () => ['0', '1', '2', '3', '4', '5', '6', '7', '8'],

  async execute(sender, command, args, { inventory }) {
    if (args.length !== 1) return sender.reply(`[ChangeSlot] Usage: ${this.usage}`);
    const result = await inventory.execute({ scope: 'inventory', action: 'select', target: args[0] });
    return sender.reply(result.message);
  }
};
