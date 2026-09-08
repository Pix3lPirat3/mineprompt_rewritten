'use strict';

module.exports = {
  command: 'disconnect',
  aliases: ['quit'],
  usage: 'disconnect',
  description: 'Gracefully disconnect from the current server.',
  requires: { entity: true },

  async execute(sender) {
    sender.reply('[Connection] Disconnecting...');
    await mineflayer.disconnect();
  }
};
