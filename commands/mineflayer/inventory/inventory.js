'use strict';

const { createTextTable } = require('../../../src/main/text-table');

function displayName(item, bot, ChatMessage) {
  if (!item.customName) return item.displayName || item.name;
  try {
    const value = bot.registry.version['<']('1.13') ? item.customName : JSON.parse(item.customName);
    return new ChatMessage(value).toString();
  } catch {
    return item.displayName || item.name;
  }
}

module.exports = {
  command: 'inventory',
  aliases: ['inv'],
  usage: 'inventory [slot]',
  description: 'Show inventory contents or inspect one slot.',
  requires: { entity: true, console: true },

  execute(sender, command, args, { bot, chatMessageClass: ChatMessage }) {
    if (args.length === 1) {
      const slot = Number(args[0]);
      if (!Number.isInteger(slot) || slot < 0 || slot >= bot.inventory.slots.length) return sender.reply('[Inventory] Slot is out of range.');
      const item = bot.inventory.slots[slot];
      if (!item) return sender.reply(`[Inventory] Slot ${slot} is empty.`);
      return sender.reply(`${displayName(item, bot, ChatMessage)}\nName: ${item.name}\nCount: ${item.count}\nSlot: ${item.slot}`);
    }
    if (args.length > 1) return sender.reply(`[Inventory] Usage: ${this.usage}`);
    const rows = bot.inventory.items().map((item) => ({
      slot: item.slot,
      item: item.name,
      count: item.count,
      name: displayName(item, bot, ChatMessage)
    }));
    return sender.reply(rows.length ? createTextTable(rows) : '[Inventory] Empty.');
  }
};
