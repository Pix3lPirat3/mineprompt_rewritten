'use strict';

module.exports = {
  command: 'disconnect',
  aliases: ['quit'],
  usage: 'disconnect',
  description: 'Gracefully disconnect from the current server.',
  requires: { entity: true },

  async execute(sender, command, args, { client }) {
    sender.reply('[Connection] Disconnecting...');
    await client.disconnect();
  }
};
