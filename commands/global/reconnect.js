'use strict';

module.exports = {
  command: 'reconnect',
  usage: 'reconnect',
  description: 'Repeat the most recent connection command.',
  requires: { console: true },

  async execute(sender) {
    const lastConnection = await database.getConnection();
    if (!lastConnection) return sender.reply('[Reconnect] No previous connection is available.');
    return term.exec(`connect ${lastConnection}`);
  }
};
