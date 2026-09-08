'use strict';

module.exports = {
  command: 'reconnect',
  usage: 'reconnect',
  description: 'Repeat the most recent connection command.',
  requires: { console: true },

  async execute(sender, command, args, { connections }) {
    try {
      return await connections.reconnect(sender.reply);
    } catch (error) {
      return sender.reply(`[Reconnect] ${error.message}`);
    }
  }
};
