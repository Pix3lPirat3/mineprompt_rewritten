'use strict';

module.exports = {
  command: 'closecontainer',
  usage: 'closecontainer',
  aliases: ['closewindow'],
  description: 'Close the active container. This is a shortcut for container close.',
  requires: { entity: true },

  async execute(sender, command, args, { inventory }) {
    if (args.length) return sender.reply(`[Container] Usage: ${this.usage}`);
    const result = await inventory.execute({ scope: 'container', action: 'close' });
    return sender.reply(result.message);
  }
};
