'use strict';

const { createTextTable } = require('../../../src/main/text-table');

module.exports = {
  command: 'window',
  aliases: ['container'],
  usage: 'window',
  description: 'Show the contents of the open container.',
  requires: { entity: true, console: true },

  execute(sender) {
    if (!bot.currentWindow) return sender.reply('[Window] No container is open.');
    const rows = bot.currentWindow.containerItems().map((item) => ({
      slot: item.slot,
      item: item.name,
      count: item.count,
      name: item.displayName || item.name
    }));
    return sender.reply(rows.length ? createTextTable(rows) : '[Window] The container is empty.');
  }
};
