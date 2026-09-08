'use strict';

module.exports = {
  command: 'cmd',
  aliases: ['command'],
  usage: 'cmd <server-command>',
  description: 'Send a slash command to the server.',
  requires: { entity: true },

  execute(sender, command, args, { bot }) {
    if (!args.length) return sender.reply(`[Command] Usage: ${this.usage}`);
    const message = args.join(' ').trim().replace(/^\//u, '');
    if (!message || message.length > 255) return sender.reply('[Command] Server command must contain 1 to 255 characters.');
    if (/^(?:login|register)\s/iu.test(message)) {
      sender.reply('[Command] Sending a redacted authentication command to the server.');
    } else {
      sender.reply(`[Command] Sending /${message}`);
    }
    bot.chat(`/${message}`);
  }
};
