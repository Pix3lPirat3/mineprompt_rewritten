'use strict';

module.exports = {
  command: 'simpleclick',
  aliases: ['clickslot'],
  usage: 'simpleclick <slot> [left|right]',
  description: 'Click a slot in the currently open window.',
  requires: { entity: true, console: true },

  async execute(sender, command, args, { inventory }) {
    const slot = Number(args[0]);
    const button = args[1]?.toLowerCase() || 'left';
    if (!Number.isInteger(slot) || slot < 0) return sender.reply('[Container] Slot is out of range.');
    if (!['left', 'right'].includes(button)) return sender.reply('[Window] Button must be left or right.');
    const result = await inventory.execute({ scope: 'container', action: 'click', target: slot, button });
    return sender.reply(result.message);
  }
};
