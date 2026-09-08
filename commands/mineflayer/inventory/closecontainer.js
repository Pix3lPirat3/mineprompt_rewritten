'use strict';

module.exports = {
  command: 'closecontainer',
  usage: 'closecontainer',
  aliases: ['closewindow'],
  description: 'Close the active container.',
  requires: { entity: true },

  execute(sender, command, args, { bot }) {
    if (args.length) return sender.reply(`[Window] Usage: ${this.usage}`);
    if (!bot.currentWindow) return sender.reply('[Window] No container is open.');
    bot.closeWindow(bot.currentWindow);
    return sender.reply('[Window] Closed the active container.');
  }
};
