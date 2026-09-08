'use strict';

module.exports = {
  command: 'simpleclick',
  aliases: ['clickslot'],
  usage: 'simpleclick <slot> [left|right]',
  description: 'Click a slot in the currently open window.',
  requires: { entity: true, console: true },

  async execute(sender, command, args) {
    if (!bot.currentWindow) return sender.reply('[Window] No container is open.');
    const slot = Number(args[0]);
    const button = args[1]?.toLowerCase() || 'left';
    if (!Number.isInteger(slot) || slot < 0 || slot >= bot.currentWindow.slots.length) return sender.reply('[Window] Slot is out of range.');
    if (!['left', 'right'].includes(button)) return sender.reply('[Window] Button must be left or right.');
    const item = bot.currentWindow.slots[slot];
    if (button === 'left') await bot.simpleClick.leftMouse(slot);
    else await bot.simpleClick.rightMouse(slot);
    return sender.reply(`[Window] ${button === 'left' ? 'Left' : 'Right'}-clicked ${item?.displayName || 'empty slot'} at ${slot}.`);
  }
};
