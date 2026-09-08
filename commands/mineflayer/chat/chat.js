'use strict';

module.exports = {
  command: 'chat',
  usage: 'chat <message>',
  aliases: ['send', 'say'],
  description: 'Send a chat message or slash command to the server.',
  requires: { entity: true },
  autocomplete: (command, args, { bot }) => Object.keys(bot.players),

  execute(sender, command, args, { bot }) {
    const message = args.join(' ').trim();
    if (!message) return sender.reply(`[Chat] Usage: ${this.usage}`);
    if (message.length > 256) return sender.reply('[Chat] Messages cannot exceed 256 characters.');
    bot.chat(message);
    return sender.reply('[Chat] Sent.');
  }
};
